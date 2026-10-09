import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brotliCompressSync } from 'node:zlib';
import { inspectWoff2 } from './font-cmap.mjs';

function base128(value) {
	const bytes = [value & 127];
	while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value & 127) | 128);
	return Buffer.from(bytes);
}

function woff(tables, mutateDirectory) {
	let directory = Buffer.concat(tables.map(({ tag, data, transform = 0, originalLength = data.length }) => {
		const transformed = tag === 'glyf' || tag === 'loca' ? transform !== 3 : transform !== 0;
		return Buffer.concat([Buffer.from([63 | transform << 6]), Buffer.from(tag),
			base128(originalLength), ...(transformed ? [base128(data.length)] : [])]);
	}));
	if (mutateDirectory) directory = mutateDirectory(directory);
	const compressed = brotliCompressSync(Buffer.concat(tables.map(table => table.data)));
	const header = Buffer.alloc(48);
	header.write('wOF2');
	header.writeUInt32BE(0x10000, 4);
	header.writeUInt32BE(48 + directory.length + compressed.length, 8);
	header.writeUInt16BE(tables.length, 12);
	header.writeUInt32BE(12 + 16 * tables.length + tables.reduce((total, table) =>
		total + Math.ceil((table.originalLength ?? table.data.length) / 4) * 4, 0), 16);
	header.writeUInt32BE(compressed.length, 20);
	return Buffer.concat([header, directory, compressed]);
}

function cmap4() {
	// A..C use delta: A maps to 0, B/C map to 1/2.
	// D..G use glyphIdArray: raw 0 remains missing; raw 65534 plus 2 wraps to 0.
	const b = Buffer.alloc(48);
	b.writeUInt16BE(4, 0);
	b.writeUInt16BE(b.length, 2);
	b.writeUInt16BE(6, 6);
	b.writeUInt16BE(4, 8);
	b.writeUInt16BE(1, 10);
	b.writeUInt16BE(2, 12);
	[0x43, 0x47, 0xffff].forEach((end, i) => b.writeUInt16BE(end, 14 + i * 2));
	[0x41, 0x44, 0xffff].forEach((start, i) => b.writeUInt16BE(start, 22 + i * 2));
	[0xffbf, 2, 1].forEach((delta, i) => b.writeUInt16BE(delta, 28 + i * 2));
	b.writeUInt16BE(4, 36);
	[3, 0, 0xfffe, 4].forEach((glyph, i) => b.writeUInt16BE(glyph, 40 + i * 2));
	return b;
}

function cmapGroups(format, groups) {
	const b = Buffer.alloc(16 + groups.length * 12);
	b.writeUInt16BE(format, 0);
	b.writeUInt32BE(b.length, 4);
	b.writeUInt32BE(groups.length, 12);
	groups.forEach((group, i) => group.forEach((value, j) => b.writeUInt32BE(value, 16 + i * 12 + j * 4)));
	return b;
}

function cmap(subtables = [{ platform: 3, encoding: 1, data: cmap4() }]) {
	const header = Buffer.alloc(4 + subtables.length * 8);
	header.writeUInt16BE(subtables.length, 2);
	let offset = header.length;
	subtables.forEach(({ platform, encoding, data }, i) => {
		header.writeUInt16BE(platform, 4 + i * 8);
		header.writeUInt16BE(encoding, 6 + i * 8);
		header.writeUInt32BE(offset, 8 + i * 8);
		offset += data.length;
	});
	return Buffer.concat([header, ...subtables.map(subtable => subtable.data)]);
}

function name() {
	const values = [[1, 0x0409, 'Legacy Family'], [16, 0x0411, 'Other Family'],
		[16, 0x0409, 'Fixture Family'], [5, 0x0409, 'Version 1.234']];
	const header = Buffer.alloc(6 + values.length * 12);
	header.writeUInt16BE(values.length, 2);
	header.writeUInt16BE(header.length, 4);
	let offset = 0;
	const strings = values.map(([id, language, text], i) => {
		const bytes = Buffer.from(text, 'utf16le').swap16(), at = 6 + i * 12;
		header.writeUInt16BE(3, at);
		header.writeUInt16BE(1, at + 2);
		header.writeUInt16BE(language, at + 4);
		header.writeUInt16BE(id, at + 6);
		header.writeUInt16BE(bytes.length, at + 8);
		header.writeUInt16BE(offset, at + 10);
		offset += bytes.length;
		return bytes;
	});
	return Buffer.concat([header, ...strings]);
}

function fvar() {
	const b = Buffer.alloc(56);
	b.writeUInt16BE(1);
	b.writeUInt16BE(16, 4);
	b.writeUInt16BE(2, 6);
	b.writeUInt16BE(2, 8);
	b.writeUInt16BE(20, 10);
	b.writeUInt16BE(12, 14);
	[['wght', 100, 400, 900], ['slnt', -12.5, 0, 0]].forEach(([tag, min, defaultValue, max], i) => {
		const at = 16 + i * 20;
		b.write(tag, at);
		b.writeInt32BE(min * 65536, at + 4);
		b.writeInt32BE(defaultValue * 65536, at + 8);
		b.writeInt32BE(max * 65536, at + 12);
	});
	return b;
}

function tables(cmapData = cmap()) {
	const os2 = Buffer.alloc(78);
	os2.writeUInt16BE(400, 4);
	return [{ tag: 'cmap', data: cmapData }, { tag: 'OS/2', data: os2 }, { tag: 'name', data: name() }];
}

test('format 4 uses delta/range offsets, ignores raw zero and wrapped glyph zero', () => {
	const result = inspectWoff2(woff(tables()));
	assert.deepEqual(result, {
		codepoints: [0x42, 0x43, 0x44, 0x47], axes: [], weight: 400,
		version: 'Version 1.234', fontFamily: 'Fixture Family',
	});
});

test('format 12 supplementary coverage skips .notdef and is sorted and unique', () => {
	const data = cmapGroups(12, [[0x41, 0x43, 0], [0x1f600, 0x1f602, 50]]);
	assert.deepEqual(inspectWoff2(woff(tables(cmap([{ platform: 3, encoding: 10, data }])))).codepoints,
		[0x42, 0x43, 0x1f600, 0x1f601, 0x1f602]);
});

test('full Unicode cmap is selected instead of unioning inconsistent BMP or UVS mappings', () => {
	const uvs = Buffer.alloc(10);
	uvs.writeUInt16BE(14);
	uvs.writeUInt32BE(10, 2);
	const data = cmap([
		{ platform: 3, encoding: 1, data: cmap4() },
		{ platform: 0, encoding: 4, data: cmapGroups(12, [[0x1f600, 0x1f600, 1]]) },
		{ platform: 0, encoding: 5, data: uvs },
	]);
	assert.deepEqual(inspectWoff2(woff(tables(data))).codepoints, [0x1f600]);
});

test('format 13 constant mappings exclude missing glyphs and Unicode surrogates', () => {
	const data = cmapGroups(13, [[0x41, 0x42, 0], [0xd7ff, 0xe000, 4], [0x10000, 0x10001, 8]]);
	assert.deepEqual(inspectWoff2(woff(tables(cmap([{ platform: 0, encoding: 6, data }])))).codepoints,
		[0xd7ff, 0xe000, 0x10000, 0x10001]);
});

test('variable axes preserve signed fractional fixed-point values', () => {
	assert.deepEqual(inspectWoff2(woff([...tables(), { tag: 'fvar', data: fvar() }])).axes, [
		{ tag: 'wght', min: 100, max: 900, default: 400 },
		{ tag: 'slnt', min: -12.5, max: 0, default: 0 },
	]);
});

test('transformed glyf/loca/hmtx lengths do not shift untouched metadata tables', () => {
	const prefix = [
		{ tag: 'glyf', transform: 0, originalLength: 2000, data: Buffer.alloc(38) },
		{ tag: 'loca', transform: 0, originalLength: 100, data: Buffer.alloc(0) },
		{ tag: 'hmtx', transform: 1, originalLength: 200, data: Buffer.from([3, 0, 100]) },
	];
	assert.deepEqual(inspectWoff2(woff([...prefix, ...tables()])).codepoints, [0x42, 0x43, 0x44, 0x47]);
	const untransformed = [
		{ tag: 'glyf', transform: 3, data: Buffer.alloc(12) },
		{ tag: 'loca', transform: 3, data: Buffer.alloc(6) },
		{ tag: 'hmtx', data: Buffer.alloc(8) },
	];
	assert.equal(inspectWoff2(woff([...untransformed, ...tables()])).fontFamily, 'Fixture Family');
});

test('signature, header, directory, compression and declared lengths are checked', () => {
	const good = woff(tables());
	const badSignature = Buffer.from(good);
	badSignature.write('wOFF');
	assert.throws(() => inspectWoff2(badSignature), /signature/);
	assert.throws(() => inspectWoff2(good.subarray(0, 47)), /truncated/);
	assert.throws(() => inspectWoff2(good.subarray(0, good.length - 1)), /length mismatch/);
	const shortDirectory = Buffer.from(good.subarray(0, 49));
	shortDirectory.writeUInt32BE(shortDirectory.length, 8);
	assert.throws(() => inspectWoff2(shortDirectory), /truncated/);
	const corruptStream = Buffer.from(good);
	corruptStream.fill(0xff, good.length - good.readUInt32BE(20));
	assert.throws(() => inspectWoff2(corruptStream));
	const longTable = tables();
	longTable[0].originalLength = longTable[0].data.length + 1;
	assert.throws(() => inspectWoff2(woff(longTable)), /decompressed length/);
	assert.throws(() => inspectWoff2(woff(tables(), directory =>
		Buffer.concat([directory.subarray(0, 5), Buffer.from([0x80]), directory.subarray(5)]))), /UIntBase128/);
	assert.throws(() => inspectWoff2(woff([...tables(), tables()[0]])), /duplicate/);
});

test('malformed cmap references and group lengths stay inside their own table', () => {
	const badRange = cmap4();
	badRange.writeUInt16BE(0xfffe, 36);
	assert.throws(() => inspectWoff2(woff(tables(cmap([{ platform: 3, encoding: 1, data: badRange }])))), /out-of-bounds/);
	const badGroups = cmapGroups(12, [[0x1f600, 0x1f601, 1]]);
	badGroups.writeUInt32BE(2, 12);
	assert.throws(() => inspectWoff2(woff(tables(cmap([{ platform: 3, encoding: 10, data: badGroups }])))), /out-of-bounds/);
	const invalidScalar = cmapGroups(12, [[0x10ffff, 0x110000, 1]]);
	assert.throws(() => inspectWoff2(woff(tables(cmap([{ platform: 0, encoding: 4, data: invalidScalar }])))), /invalid cmap group/);
	const maxp = Buffer.alloc(6);
	maxp.writeUInt16BE(2, 4);
	assert.throws(() => inspectWoff2(woff([...tables(), { tag: 'maxp', data: maxp }])), /glyph index/);
});

test('metadata offsets, axis ranges, and unknown transformations are rejected', () => {
	const badName = name();
	badName.writeUInt16BE(0xffff, 16);
	assert.throws(() => inspectWoff2(woff(tables().map(table => table.tag === 'name' ?
		{ ...table, data: badName } : table))), /out-of-bounds/);
	const badAxes = fvar();
	badAxes.writeInt32BE(950 * 65536, 24);
	assert.throws(() => inspectWoff2(woff([...tables(), { tag: 'fvar', data: badAxes }])), /invalid fvar axis/);
	assert.throws(() => inspectWoff2(woff(tables().map(table => table.tag === 'cmap' ?
		{ ...table, transform: 1 } : table))), /unsupported transform/);
	assert.throws(() => inspectWoff2(woff([...tables(),
		{ tag: 'glyf', transform: 0, data: Buffer.alloc(10) },
		{ tag: 'loca', transform: 0, data: Buffer.alloc(1) }])), /loca length/);
});
