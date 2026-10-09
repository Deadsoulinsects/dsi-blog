import { brotliDecompressSync } from 'node:zlib';

// WOFF2: https://www.w3.org/TR/WOFF2/
// OpenType: https://learn.microsoft.com/en-us/typography/opentype/spec/cmap
const tags = [
	'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post',
	'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
	'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
	'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
	'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
	'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
	'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
	'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];
const maxStreamSize = 128 * 1024 * 1024;

function requireValue(condition, message) {
	if (!condition) throw new Error(`Invalid WOFF2: ${message}`);
}

function binary(bytes, label) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const check = (offset, length) => {
		requireValue(Number.isInteger(offset) && offset >= 0 && length >= 0 &&
			offset <= bytes.length - length, `${label} truncated or out-of-bounds`);
	};
	return {
		bytes, check,
		u8(offset) { check(offset, 1); return view.getUint8(offset); },
		u16(offset) { check(offset, 2); return view.getUint16(offset); },
		u32(offset) { check(offset, 4); return view.getUint32(offset); },
		fixed(offset) { check(offset, 4); return view.getInt32(offset) / 65536; },
		tag(offset) {
			check(offset, 4);
			return String.fromCharCode(...bytes.subarray(offset, offset + 4));
		},
	};
}

function readTables(bytes) {
	const b = binary(bytes, 'header/directory');
	b.check(0, 48);
	requireValue(b.tag(0) === 'wOF2', 'bad signature');
	requireValue(b.u32(4) !== 0x74746366, 'font collections are unsupported');
	requireValue(b.u32(4) === 0x00010000 || b.tag(4) === 'OTTO', 'unsupported font flavor');
	requireValue(b.u32(8) === bytes.length, 'file length mismatch');
	requireValue(b.u16(14) === 0, 'reserved header field');
	const count = b.u16(12);
	requireValue(count > 0, 'empty table directory');
	let cursor = 48, streamSize = 0;
	const entries = new Map();
	function base128() {
		let value = 0;
		for (let i = 0; i < 5; i++) {
			const byte = b.u8(cursor++);
			requireValue(i !== 0 || byte !== 0x80, 'noncanonical UIntBase128');
			value = value * 128 + (byte & 127);
			requireValue(value <= 0xffffffff, 'UIntBase128 overflow');
			if (!(byte & 128)) return value;
		}
		throw new Error('Invalid WOFF2: unterminated UIntBase128');
	}
	for (let i = 0; i < count; i++) {
		const flags = b.u8(cursor++);
		const index = flags & 63, transform = flags >>> 6;
		const tag = index === 63 ? b.tag(cursor) : tags[index];
		if (index === 63) cursor += 4;
		requireValue(!entries.has(tag), `duplicate table ${tag}`);
		const outline = tag === 'glyf' || tag === 'loca';
		requireValue(outline ? transform === 0 || transform === 3 :
			tag === 'hmtx' ? transform === 0 || transform === 1 : transform === 0,
		`unsupported transform for ${tag}`);
		const originalLength = base128();
		const transformed = outline ? transform !== 3 : transform !== 0;
		const length = transformed ? base128() : originalLength;
		requireValue(tag !== 'loca' || !transformed || length === 0, 'transformed loca length must be zero');
		entries.set(tag, { offset: streamSize, length, transformed });
		streamSize += length;
		requireValue(streamSize <= maxStreamSize, 'decompressed stream exceeds 128 MiB limit');
	}
	const glyf = entries.get('glyf'), loca = entries.get('loca');
	requireValue(!glyf === !loca && (!glyf || glyf.transformed === loca.transformed),
		'glyf/loca transform mismatch');
	const compressedLength = b.u32(20);
	requireValue(streamSize > 0 && compressedLength > 0, 'empty compressed stream');
	b.check(cursor, compressedLength);
	let blockEnd = cursor + compressedLength;
	for (const [offset, length, original] of [[b.u32(28), b.u32(32), b.u32(36)], [b.u32(40), b.u32(44), 0]]) {
		if (offset === 0) {
			requireValue(length === 0 && original === 0, 'absent optional block has a length');
		} else {
			requireValue(length > 0 && offset >= blockEnd && offset % 4 === 0, 'invalid optional block');
			b.check(offset, length);
			blockEnd = offset + length;
		}
	}
	const decoded = brotliDecompressSync(bytes.subarray(cursor, cursor + compressedLength),
		{ maxOutputLength: streamSize, info: true });
	requireValue(decoded.buffer.length === streamSize, 'decompressed length mismatch');
	requireValue(decoded.engine.bytesWritten === compressedLength, 'trailing compressed bytes');
	const tables = new Map();
	for (const [tag, entry] of entries) {
		if (!entry.transformed) tables.set(tag,
			binary(decoded.buffer.subarray(entry.offset, entry.offset + entry.length), tag));
	}
	return tables;
}

function readCmap(b, glyphCount) {
	requireValue(b.u16(0) === 0, 'unsupported cmap version');
	const count = b.u16(2);
	b.check(4, count * 8);
	const candidates = [];
	for (let i = 0; i < count; i++) {
		const at = 4 + i * 8, platform = b.u16(at), encoding = b.u16(at + 2);
		const offset = b.u32(at + 4);
		b.check(offset, 2);
		if (!(platform === 0 && encoding !== 5 || platform === 3 && (encoding === 1 || encoding === 10))) continue;
		requireValue(offset >= 4 + count * 8, 'cmap subtable overlaps directory');
		const format = b.u16(offset);
		if (format === 14) continue; // UVS does not map standalone codepoints.
		if (format === 4 || format === 12 || format === 13)
			candidates.push({ offset, format, rank: (format === 12 ? 30 : format === 13 ? 20 : 10) + (platform === 3 ? 1 : 0) });
	}
	requireValue(candidates.length > 0, 'no supported Unicode cmap (4, 12, 13)');
	// OpenType requires one Unicode subtable to be selected; prefer full repertoire.
	candidates.sort((a, c) => c.rank - a.rank);
	const { offset, format } = candidates[0];
	const length = format === 4 ? b.u16(offset + 2) : b.u32(offset + 4);
	b.check(offset, length);
	const sub = binary(b.bytes.subarray(offset, offset + length), 'cmap subtable');
	const points = [];
	function add(codepoint, glyph) {
		requireValue(glyph <= 0xffff && (glyphCount === undefined || glyph < glyphCount),
			'cmap glyph index out-of-bounds');
		if (glyph !== 0 && !(codepoint >= 0xd800 && codepoint <= 0xdfff)) points.push(codepoint);
	}
	if (format === 4) {
		sub.check(0, 16);
		const segCountX2 = sub.u16(6), segments = segCountX2 / 2;
		requireValue(segCountX2 > 0 && segCountX2 % 2 === 0, 'invalid cmap segment count');
		sub.check(14, segments * 8 + 2);
		requireValue(sub.u16(14 + segments * 2) === 0, 'cmap reservedPad');
		let previousEnd = -1;
		for (let i = 0; i < segments; i++) {
			const end = sub.u16(14 + 2 * i), start = sub.u16(16 + 2 * segments + 2 * i);
			const delta = sub.u16(16 + 4 * segments + 2 * i);
			const rangeAt = 16 + 6 * segments + 2 * i, range = sub.u16(rangeAt);
			requireValue(start <= end && start > previousEnd && range % 2 === 0, 'invalid cmap segment');
			previousEnd = end;
			if (range) {
				requireValue(rangeAt + range >= 16 + 8 * segments, 'cmap range overlaps segment arrays');
				sub.check(rangeAt + range, (end - start + 1) * 2);
			}
			for (let cp = start; cp <= end; cp++) {
				let glyph = range ? sub.u16(rangeAt + range + 2 * (cp - start)) : cp;
				if (!range || glyph !== 0) glyph = (glyph + delta) & 0xffff;
				add(cp, glyph);
			}
		}
		requireValue(previousEnd === 0xffff, 'missing cmap terminal segment');
	} else {
		sub.check(0, 16);
		requireValue(sub.u16(2) === 0, 'cmap reserved field');
		const groups = sub.u32(12);
		sub.check(16, groups * 12);
		let previousEnd = -1;
		for (let i = 0; i < groups; i++) {
			const at = 16 + i * 12, start = sub.u32(at), end = sub.u32(at + 4), glyph = sub.u32(at + 8);
			requireValue(start <= end && end <= 0x10ffff && start > previousEnd, 'invalid cmap group');
			previousEnd = end;
			for (let cp = start; cp <= end; cp++) add(cp, format === 13 ? glyph : glyph + cp - start);
		}
	}
	return points;
}

function readAxes(b) {
	if (!b) return [];
	b.check(0, 16);
	requireValue(b.u16(0) === 1 && b.u16(2) === 0 && b.u16(6) === 2, 'unsupported fvar header');
	const offset = b.u16(4), count = b.u16(8), size = b.u16(10);
	const instances = b.u16(12), instanceSize = b.u16(14);
	requireValue(offset >= 16 && size >= 20, 'invalid fvar axes layout');
	requireValue(instanceSize === count * 4 + 4 || instanceSize === count * 4 + 6, 'invalid fvar instance size');
	b.check(offset, count * size + instances * instanceSize);
	const axes = [];
	for (let i = 0; i < count; i++) {
		const at = offset + i * size, tag = b.tag(at);
		const min = b.fixed(at + 4), defaultValue = b.fixed(at + 8), max = b.fixed(at + 12);
		requireValue(!axes.some(axis => axis.tag === tag) && min <= defaultValue && defaultValue <= max,
			'invalid fvar axis');
		axes.push({ tag, min, max, default: defaultValue });
	}
	return axes;
}

function readNames(b) {
	const format = b.u16(0), count = b.u16(2), storage = b.u16(4);
	requireValue(format === 0 || format === 1, 'unsupported name format');
	b.check(6, count * 12);
	let recordsEnd = 6 + count * 12;
	if (format === 1) {
		const languages = b.u16(recordsEnd);
		b.check(recordsEnd + 2, languages * 4);
		for (let i = 0; i < languages; i++) {
			const at = recordsEnd + 2 + i * 4;
			b.check(storage + b.u16(at + 2), b.u16(at));
		}
		recordsEnd += 2 + languages * 4;
	}
	requireValue(storage >= recordsEnd && storage <= b.bytes.length, 'invalid name storage offset');
	const names = new Map();
	const decoder = new TextDecoder('utf-16be', { fatal: true });
	for (let i = 0; i < count; i++) {
		const at = 6 + i * 12, platform = b.u16(at), encoding = b.u16(at + 2);
		const language = b.u16(at + 4), id = b.u16(at + 6), length = b.u16(at + 8);
		const offset = storage + b.u16(at + 10);
		b.check(offset, length);
		if (platform !== 0 && !(platform === 3 && [0, 1, 10].includes(encoding))) continue;
		requireValue(length % 2 === 0, 'odd Unicode name length');
		if (![1, 5, 16].includes(id)) continue;
		const text = decoder.decode(b.bytes.subarray(offset, offset + length));
		const rank = language === 0x0409 ? 3 : platform === 0 ? 2 : 1;
		if (text && (!names.has(id) || names.get(id).rank < rank)) names.set(id, { text, rank });
	}
	const fontFamily = (names.get(16) ?? names.get(1))?.text, version = names.get(5)?.text;
	requireValue(Boolean(fontFamily && version), 'missing Unicode family/version name');
	return { fontFamily, version };
}

/**
 * Inspect one TrueType/OpenType WOFF2, without reconstructing outlines.
 * Coverage uses the preferred Unicode cmap, excludes .notdef and surrogates.
 * version is name ID 5; fontFamily prefers typographic family (ID 16).
 * @param {Uint8Array} bytes
 * @returns {{codepoints:number[],axes:{tag:string,min:number,max:number,default:number}[],weight:number,version:string,fontFamily:string}}
 */
export function inspectWoff2(bytes) {
	if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected Uint8Array WOFF2 bytes');
	const tables = readTables(bytes);
	for (const tag of ['cmap', 'OS/2', 'name']) requireValue(tables.has(tag), `missing ${tag} table`);
	const maxp = tables.get('maxp');
	const glyphCount = maxp?.u16(4);
	const weight = tables.get('OS/2').u16(4);
	requireValue(weight >= 1 && weight <= 1000, 'invalid OS/2 weight class');
	return {
		codepoints: readCmap(tables.get('cmap'), glyphCount),
		axes: readAxes(tables.get('fvar')),
		weight,
		...readNames(tables.get('name')),
	};
}
