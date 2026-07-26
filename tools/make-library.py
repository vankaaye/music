#!/usr/bin/env python3
"""Build a library.json for the Music app from a folder of audio files.

Reads ID3 tags where present (no dependencies — the tag reader is built in),
falls back to "Artist - Title" filenames, and writes a manifest listing every
track. Upload the folder and the manifest together, then paste the manifest's
URL into the app under + -> Connect Library -> Link.

    python3 make-library.py /path/to/music
    python3 make-library.py /path/to/music --out library.json
    python3 make-library.py /path/to/music --base https://cdn.example.com/music/

With no --base the manifest uses relative paths, which is what you want when
library.json sits in the same folder as the audio.
"""

import argparse
import json
import os
import struct
import sys
from urllib.parse import quote

AUDIO_EXT = {'.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.oga', '.opus', '.wma'}


# ---------- minimal ID3v2 reader (title / artist / album) ----------

def _synchsafe(b):
    return (b[0] << 21) | (b[1] << 14) | (b[2] << 7) | b[3]


def _plain(b):
    return (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]


def _decode(raw, enc):
    try:
        if enc == 0:
            return raw.decode('latin-1').rstrip('\x00')
        if enc == 1:
            return raw.decode('utf-16').rstrip('\x00')
        if enc == 2:
            return raw.decode('utf-16-be').rstrip('\x00')
        return raw.decode('utf-8').rstrip('\x00')
    except Exception:
        return ''


def read_tags(path):
    """Return (title, artist, album); any may be None."""
    out = {'TIT2': None, 'TPE1': None, 'TALB': None,
           'TT2': None, 'TP1': None, 'TAL': None}
    try:
        with open(path, 'rb') as fh:
            head = fh.read(10)
            if len(head) < 10 or head[:3] != b'ID3':
                return None, None, None
            major = head[3]
            size = _synchsafe(head[6:10])
            body = fh.read(size)
    except OSError:
        return None, None, None

    pos = 0
    v22 = major <= 2
    idlen, hlen = (3, 6) if v22 else (4, 10)
    while pos + hlen <= len(body):
        fid = body[pos:pos + idlen].decode('latin-1', 'ignore')
        if not fid or fid[0] == '\x00':
            break
        if v22:
            fsize = (body[pos + 3] << 16) | (body[pos + 4] << 8) | body[pos + 5]
        elif major >= 4:
            fsize = _synchsafe(body[pos + 4:pos + 8])
        else:
            fsize = _plain(body[pos + 4:pos + 8])
        start = pos + hlen
        if fsize <= 0 or start + fsize > len(body):
            break
        if fid in out:
            frame = body[start:start + fsize]
            if frame:
                out[fid] = _decode(frame[1:], frame[0]).strip() or None
        pos = start + fsize

    title = out['TIT2'] or out['TT2']
    artist = out['TPE1'] or out['TP1']
    album = out['TALB'] or out['TAL']
    return title, artist, album


def from_filename(name):
    base = os.path.splitext(name)[0]
    if ' - ' in base:
        a, t = base.split(' - ', 1)
        return t.strip() or None, a.strip() or None
    return base.strip() or None, None


# ---------- WAV duration (other formats are probed by the app) ----------

def wav_duration(path):
    try:
        with open(path, 'rb') as fh:
            if fh.read(4) != b'RIFF':
                return 0
            fh.read(4)
            if fh.read(4) != b'WAVE':
                return 0
            rate = channels = bits = 0
            while True:
                hdr = fh.read(8)
                if len(hdr) < 8:
                    return 0
                cid, csz = hdr[:4], struct.unpack('<I', hdr[4:])[0]
                if cid == b'fmt ':
                    fmt = fh.read(csz)
                    channels = struct.unpack('<H', fmt[2:4])[0]
                    rate = struct.unpack('<I', fmt[4:8])[0]
                    bits = struct.unpack('<H', fmt[14:16])[0]
                elif cid == b'data':
                    if rate and channels and bits:
                        return round(csz / (rate * channels * bits // 8), 1)
                    return 0
                else:
                    fh.seek(csz + (csz & 1), 1)
    except Exception:
        return 0


def main():
    ap = argparse.ArgumentParser(description='Build library.json for the Music app.')
    ap.add_argument('folder', help='folder containing your audio files')
    ap.add_argument('--out', default=None,
                    help='output path (default: library.json inside the folder)')
    ap.add_argument('--base', default='',
                    help='absolute URL prefix; omit to use relative paths')
    args = ap.parse_args()

    root = os.path.abspath(args.folder)
    if not os.path.isdir(root):
        sys.exit('Not a folder: ' + root)

    base = args.base
    if base and not base.endswith('/'):
        base += '/'

    tracks, skipped = [], 0
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in sorted(filenames):
            if os.path.splitext(fn)[1].lower() not in AUDIO_EXT:
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace(os.sep, '/')

            title, artist, album = read_tags(full)
            if not title or not artist:
                ftitle, fartist = from_filename(fn)
                title = title or ftitle
                artist = artist or fartist
            if not title:
                skipped += 1

            entry = {'url': base + quote(rel)}
            if title:
                entry['title'] = title
            if artist:
                entry['artist'] = artist
            if album:
                entry['album'] = album
            try:
                entry['size'] = os.path.getsize(full)
            except OSError:
                pass
            if fn.lower().endswith('.wav'):
                d = wav_duration(full)
                if d:
                    entry['duration'] = d
            tracks.append(entry)

    if not tracks:
        sys.exit('No audio files found in ' + root)

    out_path = args.out or os.path.join(root, 'library.json')
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump({'tracks': tracks}, fh, ensure_ascii=False, indent=1)

    print('Wrote {} with {} track(s).'.format(out_path, len(tracks)))
    if skipped:
        print('{} file(s) had no usable title; the app will fall back to the '
              'filename.'.format(skipped))
    if not base:
        print('Relative paths used — keep library.json in the same folder as '
              'the audio when you upload.')


if __name__ == '__main__':
    main()
