import assert from 'node:assert/strict';
import { inspectWoff2 } from './font-cmap.mjs';
import {
	fontBytes, fontLicense, fontManifest, hasFontCharacter, verifyPublishedFontCoverage,
} from '../src/fonts/resources.mjs';

let bytes = 0;
const effective = new Map(fontManifest.families.map((family) => [family.id, new Set()]));
for (const face of fontManifest.faces) {
	const data = fontBytes(face.id);
	const info = inspectWoff2(data);
	assert.equal(info.version, face.fontVersion, `${face.id} font version`);
	assert.equal(data.length, face.bytes);
	const weights = face.weight.split(' ').map(Number);
	const axis = info.axes.find((entry) => entry.tag === 'wght');
	if (weights.length === 2) {
		assert.ok(axis && axis.min <= weights[0] && axis.max >= weights[1], `${face.id} variable weight`);
	} else {
		assert.equal(info.weight, weights[0], `${face.id} static weight`);
	}
	const declared = face.unicodeRange.split(',').map((value) => {
		const match = value.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i);
		assert.ok(match, `Invalid CSS unicode range: ${value}`);
		return [parseInt(match[1], 16), parseInt(match[2] ?? match[1], 16)];
	});
	// A raw cmap may also include glyphs outside this face's advertised CSS range.
	for (const codepoint of info.codepoints) {
		if (declared.some(([start, end]) => codepoint >= start && codepoint <= end)) {
			effective.get(face.family).add(codepoint);
		}
	}
	bytes += data.length;
}
for (const family of fontManifest.families) {
	assert.match(fontLicense(family.id), /SIL OPEN FONT LICENSE Version 1\.1/);
	for (const [start, end] of family.coverage) {
		for (let point = start; point <= end; point++) {
			assert.ok(effective.get(family.id).has(point), `${family.id} missing advertised U+${point.toString(16)}`);
		}
	}
}
for (const char of '中文简体繁體，。！？（）ＡＢＣａｂｃ１２３éΩ𠮷𠀋') {
	assert.ok(hasFontCharacter('noto-sans-sc', char.codePointAt(0)), `Sans ${char}`);
	assert.ok(hasFontCharacter('noto-serif-sc', char.codePointAt(0)), `Serif ${char}`);
}
for (const weight of ['400', '500', '700']) {
	assert.ok(fontManifest.faces.some((face) => face.family === 'ibm-plex-mono' && face.weight === weight && face.style === 'normal'));
}
const coverage = verifyPublishedFontCoverage();
console.log(JSON.stringify({ faces: fontManifest.faces.length, bytes, ...coverage }, null, 2));
