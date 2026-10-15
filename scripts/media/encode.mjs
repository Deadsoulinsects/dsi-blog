import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { WEB_MEDIA_POLICY as policy } from '../../src/shared/content/web-media.mjs';

sharp.concurrency(4);
const rate = (value) => {
	const [n, d = 1] = String(value).split('/').map(Number);
	return n / d;
};

function run(executable, args, timeout = 60_000, signal) {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal });
		const stdout = [], stderr = [];
		let bytes = 0, failure;
		const fail = (error) => { failure ??= error; child.kill('SIGKILL'); };
		const timer = setTimeout(() => fail(new Error(`${executable} timed out after ${timeout}ms`)), timeout);
		for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) {
			stream.on('data', (chunk) => {
				bytes += chunk.length;
				if (bytes > 8 * 1024 * 1024) fail(new Error(`${executable} exceeded its 8MiB output limit`));
				else chunks.push(chunk);
			});
		}
		child.on('error', (error) => { failure ??= new Error(`Cannot run ${executable}: ${error.message}`, { cause: error }); });
		child.on('close', (code, signal) => {
			clearTimeout(timer);
			if (failure) reject(failure);
			else if (code !== 0) reject(new Error(`${executable} failed (${code ?? signal}): ${Buffer.concat(stderr).toString()}`));
			else resolvePromise(Buffer.concat(stdout));
		});
	});
}

async function encodeImage(file, workDir) {
	const input = await readFile(file);
	const meta = await sharp(input, { animated: true }).metadata();
	// libvips may expose APNG as a static PNG; inspect its animation-control chunk.
	if (meta.format === 'png') {
		for (let offset = 8; offset + 12 <= input.length;) {
			if (input.toString('ascii', offset + 4, offset + 8) === 'acTL')
				throw new Error('Animated PNG is unsupported; export a static image first.');
			offset += input.readUInt32BE(offset) + 12;
		}
	}
	const format = meta.format === 'heif' && meta.compression === 'av1' ? 'avif' : meta.format;
	if (!['jpeg', 'png', 'webp', 'avif'].includes(format) || (meta.pages ?? 1) !== 1)
		throw new Error(`Unsupported image ${file}: use static JPEG, PNG, WebP or AVIF; SVG and animation are unsupported.`);
	const rotated = [5, 6, 7, 8].includes(meta.orientation);
	const source = { width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height, format };
	const variants = [], sizes = new Set();
	for (const width of policy.image.widths) {
		const { data, info } = await sharp(input).autoOrient().toColourspace(policy.image.colourspace)
			.resize({ width, height: policy.image.maxHeight, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: policy.image.quality, effort: policy.image.effort,
				lossless: policy.image.losslessFormats.includes(format) }).toBuffer({ resolveWithObject: true });
		const key = `${info.width}x${info.height}`;
		if (sizes.has(key)) continue;
		sizes.add(key);
		const output = join(workDir, `image-${key}.webp`);
		await writeFile(output, data);
		variants.push({ file: output, width: info.width, height: info.height, type: 'image/webp' });
	}
	variants.sort((a, b) => a.width - b.width);
	return { source, variants };
}

function inspectVideo(probe) {
	const video = probe.streams?.find((stream) => stream.codec_type === 'video');
	const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
	if (!video || !probe.format?.format_name?.split(',').includes('mp4') || !['hevc', 'h264'].includes(video.codec_name))
		throw new Error('Unsupported video: supply an MP4 containing H.264 or HEVC video.');
	const duration = Number(video.duration ?? probe.format.duration);
	const fps = rate(video.avg_frame_rate) || rate(video.r_frame_rate);
	if (!(duration > 0) || !Number.isFinite(duration) || !(fps > 0) || !Number.isFinite(fps))
		throw new Error('Cannot establish duration/frame rate; remux the source with valid timestamps.');
	const unsupported = /dovi|dolby|mastering display|content light/i.test(JSON.stringify(video.side_data_list ?? []));
	if (unsupported || !['bt709', 'smpte170m', 'bt470bg'].includes(video.color_primaries)
		|| !['bt709', 'smpte170m', 'gamma22', 'gamma28'].includes(video.color_transfer)
		|| !['bt709', 'smpte170m', 'bt470bg'].includes(video.color_space)
		|| !/^yuv(?:j)?420p(?:10le)?$/.test(video.pix_fmt))
		throw new Error('HDR, untagged or unsupported colour data: export a correctly tagged SDR BT.709 HEVC MP4 first.');
	if (video.sample_aspect_ratio && !['1:1', 'N/A'].includes(video.sample_aspect_ratio))
		throw new Error('Non-square pixels are unsupported; export square-pixel SDR video first.');
	const rotation = Number(video.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
	if (!Number.isFinite(rotation) || rotation % 90 !== 0)
		throw new Error('Unsupported rotation; export with a baked-in right-angle orientation.');
	const swapped = Math.abs(rotation % 180) === 90;
	const width = swapped ? video.height : video.width, height = swapped ? video.width : video.height;
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2)
		throw new Error('Invalid video dimensions.');
	return { video, audio, fps, source: { width, height, format: 'mp4', codec: video.codec_name, fps, duration } };
}

/** Pass needVideo:true to obtain the video recipe before conversion. */
export async function createEncoder({ ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg',
	ffprobe = process.env.FFPROBE_BIN || 'ffprobe', needVideo = false, signal } = {}) {
	signal?.throwIfAborted();
	const execute = (executable, args, timeout) => run(executable, args, timeout, signal);
	const recipes = {
		image: JSON.stringify({ implementation: 1, version: policy.version, policy: policy.image, sharp: sharp.versions }),
		video: '',
	};
	let videoReady;
	const ensureVideo = () => videoReady ??= (async () => {
		const signature = (await execute(ffmpeg, ['-version'])).toString().replace(/\r\n/g, '\n').trim();
		recipes.video = JSON.stringify({ implementation: 1, version: policy.version, policy: policy.video,
			poster: policy.image, sharp: sharp.versions, ffmpeg: signature, threads: 4, colour: 'tagged-sdr-only' });
	})();
	if (needVideo) await ensureVideo();
	const probe = async (file) => JSON.parse((await execute(ffprobe,
		['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).toString());
	async function encodeVideo(file, workDir) {
		await ensureVideo();
		const { video, audio, fps, source } = inspectVideo(await probe(file));
		const p = policy.video;
		const scale = Math.min(1, p.width / source.width, p.height / source.height);
		const width = Math.max(2, Math.floor(source.width * scale / 2) * 2);
		const height = Math.max(2, Math.floor(source.height * scale / 2) * 2);
		const output = join(workDir, 'video.mp4');
		const filters = [`scale=${width}:${height}`, 'setsar=1'];
		if (fps > p.maxFps) filters.push(`fps=${p.maxFps}`);
		await execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '4', '-i', file,
			'-map', `0:${video.index}`, ...(audio ? ['-map', `0:${audio.index}`] : []),
			'-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn', '-filter_threads', '4',
			'-vf', filters.join(','), '-c:v', 'libx264', '-threads:v', '4', '-pix_fmt', p.pixelFormat,
			'-crf', String(p.crf), '-preset', p.preset, '-fps_mode', 'vfr',
			'-color_primaries', video.color_primaries, '-color_trc', video.color_transfer,
			'-colorspace', video.color_space, '-c:a', p.audioCodec, '-b:a', p.audioBitrate,
			...(p.faststart ? ['-movflags', '+faststart'] : []), output], 600_000);
		const verified = await probe(output);
		const v = verified.streams?.find((stream) => stream.codec_type === 'video');
		const a = verified.streams?.find((stream) => stream.codec_type === 'audio');
		const outputFps = rate(v?.avg_frame_rate);
		const duration = Number(v?.duration ?? verified.format?.duration);
		const tolerance = Math.max(0.25, 2 / Math.min(fps, p.maxFps) + 0.1);
		if (v?.codec_name !== p.codec || v.pix_fmt !== p.pixelFormat || v.width !== width || v.height !== height
			|| !(outputFps > 0) || outputFps > Math.min(fps, p.maxFps) + 0.01
			|| !Number.isFinite(duration) || Math.abs(duration - source.duration) > tolerance
			|| (audio ? a?.codec_name !== p.audioCodec : !!a)
			|| verified.streams.some((stream) => !['video', 'audio'].includes(stream.codec_type)))
			throw new Error('Encoded MP4 failed codec, dimensions, frame rate, duration or audio verification.');
		const frame = await execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '4',
			'-i', output, '-map', '0:v:0', '-frames:v', '1', '-threads:v', '4', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
		const posterFile = join(workDir, 'poster.webp');
		const poster = await sharp(frame).toColourspace(policy.image.colourspace)
			.resize({ width: p.posterWidth, withoutEnlargement: true })
			.webp({ quality: policy.image.quality, effort: policy.image.effort }).toFile(posterFile);
		return { source, variants: [{ file: output, width, height, type: 'video/mp4' }],
			poster: { file: posterFile, width: poster.width, height: poster.height, type: 'image/webp' } };
	}
	return { recipes, async encode({ file, kind, workDir }) {
		signal?.throwIfAborted();
		if (!['image', 'video'].includes(kind)) throw new TypeError(`Unsupported media kind: ${kind}`);
		const directory = resolve(workDir);
		await mkdir(directory, { recursive: true });
		return kind === 'image' ? encodeImage(resolve(file), directory) : encodeVideo(resolve(file), directory);
	} };
}
