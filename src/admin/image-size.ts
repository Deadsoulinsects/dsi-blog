export type ImageSize = { readonly width: number; readonly height: number };

const orientationFromExif = (view: DataView, start: number, end: number): number => {
	if (start + 14 > end || view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return 1;
	const tiff = start + 6;
	const endian = view.getUint16(tiff);
	if (endian !== 0x4949 && endian !== 0x4d4d) return 1;
	const little = endian === 0x4949;
	if (view.getUint16(tiff + 2, little) !== 42) return 1;
	const directory = tiff + view.getUint32(tiff + 4, little);
	if (directory + 2 > end) return 1;
	const entries = view.getUint16(directory, little);
	for (let index = 0; index < entries; index += 1) {
		const entry = directory + 2 + index * 12;
		if (entry + 12 > end) return 1;
		if (view.getUint16(entry, little) === 0x0112
			&& view.getUint16(entry + 2, little) === 3 && view.getUint32(entry + 4, little) === 1) {
			return view.getUint16(entry + 8, little);
		}
	}
	return 1;
};

// Skip APP payloads by their declared length, including large phone depth-map segments.
// Only the initial prefix, EXIF and frame dimensions are read into JavaScript memory.
export const readImageSize = async (file: File): Promise<ImageSize | undefined> => {
	if (!/\.jpe?g$/iu.test(file.name)) return undefined;
	const bytes = await file.slice(0, Math.min(65_536, file.size)).arrayBuffer();
	const view = new DataView(bytes);
	if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined;
	const read = async (start: number, length: number): Promise<DataView> =>
		start + length <= view.byteLength
			? new DataView(bytes, start, length)
			: new DataView(await file.slice(start, start + length).arrayBuffer());
	let offset = 2;
	let orientation = 1;
	while (offset + 4 <= file.size) {
		let header = await read(offset, 4);
		if (header.getUint8(0) !== 0xff) return undefined;
		while (header.getUint8(1) === 0xff) {
			offset += 1;
			if (offset + 4 > file.size) return undefined;
			header = await read(offset, 4);
		}
		const marker = header.getUint8(1);
		if (marker === 0xda || marker === 0xd9) return undefined;
		const length = header.getUint16(2);
		if (length < 2 || offset + 2 + length > file.size) return undefined;
		if (marker === 0xe1) {
			const exif = await read(offset + 4, length - 2);
			orientation = orientationFromExif(exif, 0, exif.byteLength);
		}
		if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
			if (length < 7) return undefined;
			const dimensions = await read(offset + 4, 5);
			const height = dimensions.getUint16(1);
			const width = dimensions.getUint16(3);
			if (width === 0 || height === 0) return undefined;
			return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
		}
		offset += length + 2;
	}
	return undefined;
};
