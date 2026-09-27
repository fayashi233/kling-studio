import fs from "fs";
import path from "path";

export interface ZipEntry {
  path: string;
  data: Buffer | Uint8Array | string;
  /** For large files: read from this disk path in 1MB chunks instead of loading into memory */
  sourceFile?: string;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosDate, dosTime };
}

function asBuffer(data: ZipEntry["data"]): Buffer {
  return Buffer.isBuffer(data)
    ? data
    : typeof data === "string"
      ? Buffer.from(data, "utf8")
      : Buffer.from(data);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function createZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(normalizePath(entry.path), "utf8");
    const data = asBuffer(entry.data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, end]);
}

// ── Streaming helpers (for createZipToFile) ──

function updateCRC32(prevCrc: number, chunk: Buffer): number {
  let crc = prevCrc;
  for (const byte of chunk) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return crc >>> 0;
}

function makeLocalHeader(
  nameLen: number,
  crc: number,
  size: number,
  dosDate: number,
  dosTime: number,
  useDescriptor: boolean
): Buffer {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(useDescriptor ? 0x0808 : 0x0800, 6);  // bit 11=UTF-8 name, bit 3=data descriptor
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(useDescriptor ? 0 : crc, 14);
  local.writeUInt32LE(useDescriptor ? 0 : size, 18);
  local.writeUInt32LE(useDescriptor ? 0 : size, 22);
  local.writeUInt16LE(nameLen, 26);
  local.writeUInt16LE(0, 28);
  return local;
}

function makeDataDescriptor(crc: number, size: number): Buffer {
  const desc = Buffer.alloc(16);
  desc.writeUInt32LE(0x08074b50, 0);
  desc.writeUInt32LE(crc, 4);
  desc.writeUInt32LE(size, 8);
  desc.writeUInt32LE(size, 12);
  return desc;
}

function makeCentralEntry(
  nameLen: number,
  crc: number,
  size: number,
  dosDate: number,
  dosTime: number,
  localOffset: number,
  useDescriptor: boolean
): Buffer {
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(useDescriptor ? 0x0808 : 0x0800, 8);  // bit 11=UTF-8 name, bit 3=data descriptor
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(nameLen, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(localOffset, 42);
  return central;
}

function makeEOCD(entryCount: number, centralSize: number, centralOffset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

interface CentralRecord {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
  dosDate: number;
  dosTime: number;
  useDescriptor: boolean;
}

/**
 * Write a ZIP file to disk, streaming large files from disk in chunks.
 * Entries with `sourceFile` set are read in 1MB chunks (never loaded into memory).
 * Entries without `sourceFile` use `data` directly.
 */
export function createZipToFile(
  entries: ZipEntry[],
  outputPath: string
): { fileSize: number } {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fd = fs.openSync(outputPath, "w");
  const { dosDate, dosTime } = dosDateTime();
  const centralRecords: CentralRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(normalizePath(entry.path), "utf8");

    if (entry.sourceFile && fs.existsSync(entry.sourceFile)) {
      // ── Large file: stream from disk, compute CRC incrementally ──
      const localHeader = makeLocalHeader(name.length, 0, 0, dosDate, dosTime, true);
      fs.writeSync(fd, localHeader);
      fs.writeSync(fd, name);

      const srcFd = fs.openSync(entry.sourceFile, "r");
      let crc = 0xffffffff;
      let size = 0;
      const chunkSize = 1024 * 1024; // 1 MB
      const buffer = Buffer.alloc(chunkSize);
      let bytesRead: number;
      while ((bytesRead = fs.readSync(srcFd, buffer, 0, chunkSize, null)) > 0) {
        const chunk = buffer.subarray(0, bytesRead);
        crc = updateCRC32(crc, chunk);
        size += bytesRead;
        fs.writeSync(fd, chunk);
      }
      fs.closeSync(srcFd);
      crc = (crc ^ 0xffffffff) >>> 0;

      const descriptor = makeDataDescriptor(crc, size);
      fs.writeSync(fd, descriptor);

      centralRecords.push({ name, crc, size, offset, dosDate, dosTime, useDescriptor: true });
      offset += localHeader.length + name.length + size + descriptor.length;
    } else {
      // ── Small file: data already in memory ──
      const data = asBuffer(entry.data);
      const crc = crc32(data);

      const localHeader = makeLocalHeader(name.length, crc, data.length, dosDate, dosTime, false);
      fs.writeSync(fd, localHeader);
      fs.writeSync(fd, name);
      fs.writeSync(fd, data);

      centralRecords.push({ name, crc, size: data.length, offset, dosDate, dosTime, useDescriptor: false });
      offset += localHeader.length + name.length + data.length;
    }
  }

  // ── Central directory ──
  const centralOffset = offset;
  for (const rec of centralRecords) {
    const header = makeCentralEntry(
      rec.name.length, rec.crc, rec.size, rec.dosDate, rec.dosTime, rec.offset, rec.useDescriptor
    );
    fs.writeSync(fd, header);
    fs.writeSync(fd, rec.name);
  }

  // ── EOCD ──
  const centralSize = centralRecords.reduce((sum, rec) => sum + 46 + rec.name.length, 0);
  fs.writeSync(fd, makeEOCD(centralRecords.length, centralSize, centralOffset));

  fs.closeSync(fd);

  const stat = fs.statSync(outputPath);
  return { fileSize: stat.size };
}
