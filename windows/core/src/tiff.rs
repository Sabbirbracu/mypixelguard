//! Minimal TIFF / EXIF structure reader and rewriter.
//!
//! Used to (a) reset the orientation / pixel-size tags when pixels were re-oriented, and
//! (b) remove chosen private fields (GPS, device, dates …) from an EXIF block without touching pixels.

const EXIF_IFD: u16 = 0x8769;
const GPS_IFD: u16 = 0x8825;
const INTEROP_IFD: u16 = 0xA005;
const THUMB_OFFSET: u16 = 0x0201;
const THUMB_LENGTH: u16 = 0x0202;
/// Tags whose values point at image data that is not part of an EXIF block.
const DATA_POINTER_TAGS: [u16; 4] = [0x0111, 0x0117, 0x0144, 0x0145];
const MAKER_NOTE: u16 = 0x927C;

fn type_size(t: u16) -> usize {
    match t {
        1 | 2 | 6 | 7 => 1,
        3 | 8 => 2,
        4 | 9 | 11 => 4,
        5 | 10 | 12 => 8,
        _ => 1,
    }
}

#[derive(Clone, Debug)]
pub struct Entry {
    pub tag: u16,
    pub typ: u16,
    pub count: u32,
    /// Raw value bytes in the file's byte order.
    pub data: Vec<u8>,
}

#[derive(Clone, Debug, Default)]
pub struct Ifd {
    pub entries: Vec<Entry>,
    /// Sub-IFDs reached through a pointer tag (Exif, GPS, Interoperability).
    pub children: Vec<(u16, Ifd)>,
    pub next: Option<Box<Ifd>>,
    /// Embedded thumbnail JPEG (IFD1 only).
    pub thumbnail: Option<Vec<u8>>,
}

pub struct Tiff {
    pub little: bool,
    pub ifd0: Ifd,
}

struct Rd<'a> {
    t: &'a [u8],
    little: bool,
}

impl<'a> Rd<'a> {
    fn u16(&self, o: usize) -> Option<u16> {
        let b = self.t.get(o..o + 2)?;
        Some(if self.little { u16::from_le_bytes([b[0], b[1]]) } else { u16::from_be_bytes([b[0], b[1]]) })
    }
    fn u32(&self, o: usize) -> Option<u32> {
        let b = self.t.get(o..o + 4)?;
        let a = [b[0], b[1], b[2], b[3]];
        Some(if self.little { u32::from_le_bytes(a) } else { u32::from_be_bytes(a) })
    }

    fn ifd(&self, offset: usize, depth: usize, visited: &mut Vec<usize>) -> Option<Ifd> {
        if depth > 6 || visited.contains(&offset) {
            return None;
        }
        visited.push(offset);
        let count = self.u16(offset)? as usize;
        if count > 1000 {
            return None;
        }
        let mut ifd = Ifd::default();
        let mut thumb_off = None;
        let mut thumb_len = None;
        for i in 0..count {
            let e = offset + 2 + i * 12;
            let tag = self.u16(e)?;
            let typ = self.u16(e + 2)?;
            let n = self.u32(e + 4)?;
            let size = type_size(typ).checked_mul(n as usize)?;
            let data = if size <= 4 {
                self.t.get(e + 8..e + 8 + size)?.to_vec()
            } else {
                let o = self.u32(e + 8)? as usize;
                self.t.get(o..o.checked_add(size)?)?.to_vec()
            };
            match tag {
                EXIF_IFD | GPS_IFD | INTEROP_IFD if typ == 4 && n == 1 => {
                    let target = self.u32(e + 8)? as usize;
                    if let Some(child) = self.ifd(target, depth + 1, visited) {
                        ifd.children.push((tag, child));
                    }
                }
                THUMB_OFFSET => thumb_off = self.u32(e + 8),
                THUMB_LENGTH => thumb_len = self.u32(e + 8),
                t if DATA_POINTER_TAGS.contains(&t) => {}
                _ => ifd.entries.push(Entry { tag, typ, count: n, data }),
            }
        }
        if let (Some(o), Some(l)) = (thumb_off, thumb_len) {
            ifd.thumbnail = self.t.get(o as usize..(o as usize).checked_add(l as usize)?).map(|s| s.to_vec());
        }
        let next = self.u32(offset + 2 + count * 12)? as usize;
        if next != 0 {
            ifd.next = self.ifd(next, depth + 1, visited).map(Box::new);
        }
        Some(ifd)
    }
}

impl Tiff {
    pub fn parse(t: &[u8]) -> Option<Tiff> {
        if t.len() < 8 {
            return None;
        }
        let little = match &t[0..2] {
            b"II" => true,
            b"MM" => false,
            _ => return None,
        };
        let rd = Rd { t, little };
        if rd.u16(2)? != 42 {
            return None;
        }
        let ifd0 = rd.ifd(rd.u32(4)? as usize, 0, &mut Vec::new())?;
        Some(Tiff { little, ifd0 })
    }

    pub fn serialize(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(if self.little { b"II" } else { b"MM" });
        out.extend_from_slice(&self.num16(42));
        out.extend_from_slice(&self.num32(8));
        self.write_ifd(&self.ifd0, &mut out);
        out
    }

    fn num16(&self, v: u16) -> [u8; 2] {
        if self.little { v.to_le_bytes() } else { v.to_be_bytes() }
    }
    fn num32(&self, v: u32) -> [u8; 4] {
        if self.little { v.to_le_bytes() } else { v.to_be_bytes() }
    }

    /// Appends `ifd` (and everything it points to) at the end of `out`; returns its offset.
    fn write_ifd(&self, ifd: &Ifd, out: &mut Vec<u8>) -> usize {
        if out.len() % 2 == 1 {
            out.push(0);
        }
        let table_at = out.len();

        // Entry rows: (tag, type, count, value-field). Pointer values are patched after their targets exist.
        struct Row {
            tag: u16,
            typ: u16,
            count: u32,
            value: [u8; 4],
        }
        let mut rows: Vec<Row> = Vec::new();
        let mut blobs: Vec<(usize, Vec<u8>)> = Vec::new(); // (row index, data to place out of line)
        for e in &ifd.entries {
            if e.tag == MAKER_NOTE {
                continue;
            }
            let mut value = [0u8; 4];
            if e.data.len() <= 4 {
                value[..e.data.len()].copy_from_slice(&e.data);
            } else {
                blobs.push((rows.len(), e.data.clone()));
            }
            rows.push(Row { tag: e.tag, typ: e.typ, count: e.count, value });
        }
        let mut pointer_rows: Vec<(usize, usize)> = Vec::new(); // (row index, child index)
        for (ci, (tag, _)) in ifd.children.iter().enumerate() {
            pointer_rows.push((rows.len(), ci));
            rows.push(Row { tag: *tag, typ: 4, count: 1, value: [0; 4] });
        }
        let thumb_rows = ifd.thumbnail.as_ref().map(|t| {
            let at = rows.len();
            rows.push(Row { tag: THUMB_OFFSET, typ: 4, count: 1, value: [0; 4] });
            rows.push(Row { tag: THUMB_LENGTH, typ: 4, count: 1, value: self.num32(t.len() as u32) });
            at
        });

        // Tags must appear in ascending order; remember where each row ended up.
        let mut order: Vec<usize> = (0..rows.len()).collect();
        order.sort_by_key(|&i| rows[i].tag);

        let table_len = 2 + rows.len() * 12 + 4;
        out.resize(table_at + table_len, 0);

        // Out-of-line values.
        for (ri, data) in blobs {
            if out.len() % 2 == 1 {
                out.push(0);
            }
            let off = out.len() as u32;
            out.extend_from_slice(&data);
            rows[ri].value = self.num32(off);
        }
        // Child IFDs.
        for (ri, ci) in pointer_rows {
            let off = self.write_ifd(&ifd.children[ci].1, out) as u32;
            rows[ri].value = self.num32(off);
        }
        // Thumbnail bytes.
        if let (Some(at), Some(t)) = (thumb_rows, ifd.thumbnail.as_ref()) {
            if out.len() % 2 == 1 {
                out.push(0);
            }
            rows[at].value = self.num32(out.len() as u32);
            out.extend_from_slice(t);
        }
        // Next IFD.
        let next_off = match &ifd.next {
            Some(n) => self.write_ifd(n, out) as u32,
            None => 0,
        };

        // Fill the table now that every offset is known.
        out[table_at..table_at + 2].copy_from_slice(&self.num16(rows.len() as u16));
        for (pos, &i) in order.iter().enumerate() {
            let r = &rows[i];
            let o = table_at + 2 + pos * 12;
            out[o..o + 2].copy_from_slice(&self.num16(r.tag));
            out[o + 2..o + 4].copy_from_slice(&self.num16(r.typ));
            out[o + 4..o + 8].copy_from_slice(&self.num32(r.count));
            out[o + 8..o + 12].copy_from_slice(&r.value);
        }
        let end = table_at + 2 + rows.len() * 12;
        out[end..end + 4].copy_from_slice(&self.num32(next_off));
        table_at
    }
}

// MARK: Private-field removal

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PrivateField {
    Location,
    Device,
    Dates,
    Author,
    Software,
}

impl PrivateField {
    pub const ALL: [PrivateField; 5] =
        [PrivateField::Location, PrivateField::Device, PrivateField::Dates, PrivateField::Author, PrivateField::Software];

    /// Whether a metadata key (lower-cased, letters and digits only) belongs to this field.
    /// Location is handled separately for EXIF because it removes the whole GPS directory.
    pub fn matches_key(self, key: &str) -> bool {
        let tokens: &[&str] = match self {
            PrivateField::Location => &["gps", "location", "latitude", "longitude", "city", "country", "provincestate", "sublocation"],
            PrivateField::Device => &["make", "model", "lensmake", "lensmodel", "lensinfo", "cameramodelname", "serialnumber"],
            PrivateField::Dates => &["date", "time"],
            PrivateField::Author => {
                // CreatorTool names software, so it belongs to the editing-software field.
                if key.contains("creatortool") {
                    return false;
                }
                &["artist", "author", "creator", "owner", "copyright", "writer", "byline", "credit"]
            }
            PrivateField::Software => &["software", "processingsoftware", "hostcomputer", "creatortool"],
        };
        tokens.iter().any(|t| key.contains(t))
    }

    fn exif_tag(self, tag: u16) -> bool {
        match self {
            PrivateField::Location => false,
            PrivateField::Device => matches!(tag, 0x010F | 0x0110 | 0xA430 | 0xA431 | 0xA432 | 0xA433 | 0xA434 | 0xA435 | 0xA420),
            PrivateField::Dates => matches!(tag, 0x0132 | 0x9003 | 0x9004 | 0x9010..=0x9012 | 0x9290..=0x9292),
            PrivateField::Author => matches!(tag, 0x013B | 0x8298 | 0x9C9D | 0xA430),
            PrivateField::Software => matches!(tag, 0x0131 | 0x013C | 0x000B),
        }
    }
}

fn filter_ifd(ifd: &mut Ifd, fields: &[PrivateField], in_gps: bool) {
    if in_gps {
        // GPS directory survives only when location is kept; dates inside it may still go.
        if fields.contains(&PrivateField::Dates) {
            ifd.entries.retain(|e| !matches!(e.tag, 0x0007 | 0x001D));
        }
    } else {
        ifd.entries.retain(|e| !fields.iter().any(|f| f.exif_tag(e.tag)));
    }
    if fields.contains(&PrivateField::Location) && !in_gps {
        ifd.children.retain(|(tag, _)| *tag != GPS_IFD);
    }
    for (tag, child) in ifd.children.iter_mut() {
        filter_ifd(child, fields, *tag == GPS_IFD);
    }
    if let Some(n) = ifd.next.as_mut() {
        filter_ifd(n, fields, false);
        if fields.contains(&PrivateField::Dates) {
            n.entries.retain(|e| !PrivateField::Dates.exif_tag(e.tag));
        }
    }
}

/// Removes the chosen fields from an EXIF TIFF block and returns the rebuilt block.
/// MakerNote is always dropped: it holds serial numbers and device detail and can't be moved safely.
pub fn remove_fields(tiff: &[u8], fields: &[PrivateField]) -> Option<Vec<u8>> {
    let mut t = Tiff::parse(tiff)?;
    filter_ifd(&mut t.ifd0, fields, false);
    Some(t.serialize())
}

// MARK: In-place patching

fn entry_offset(rd: &Rd, ifd: usize, tag: u16) -> Option<usize> {
    let count = rd.u16(ifd)? as usize;
    (0..count.min(1000)).map(|i| ifd + 2 + i * 12).find(|&e| rd.u16(e) == Some(tag))
}

fn set_number(t: &mut [u8], little: bool, e: usize, value: u32) {
    let typ = if little { u16::from_le_bytes([t[e + 2], t[e + 3]]) } else { u16::from_be_bytes([t[e + 2], t[e + 3]]) };
    match typ {
        3 => {
            let v = if little { (value.min(0xFFFF) as u16).to_le_bytes() } else { (value.min(0xFFFF) as u16).to_be_bytes() };
            t[e + 8..e + 10].copy_from_slice(&v);
        }
        4 => t[e + 8..e + 12].copy_from_slice(&if little { value.to_le_bytes() } else { value.to_be_bytes() }),
        _ => {}
    }
}

/// Adapts an EXIF block to pixels that were already rotated upright: orientation becomes 1 and the
/// pixel dimension tags describe the new image.
pub fn patch_for_pixels(t: &mut Vec<u8>, width: u32, height: u32) {
    let little = match t.get(0..2) {
        Some(b"II") => true,
        Some(b"MM") => false,
        _ => return,
    };
    let snapshot = t.clone();
    let rd = Rd { t: &snapshot, little };
    let Some(ifd0) = rd.u32(4).map(|v| v as usize) else { return };
    if let Some(e) = entry_offset(&rd, ifd0, 0x0112) {
        set_number(t, little, e, 1);
    }
    if let Some(p) = entry_offset(&rd, ifd0, EXIF_IFD) {
        if let Some(exif_ifd) = rd.u32(p + 8).map(|v| v as usize) {
            if let Some(e) = entry_offset(&rd, exif_ifd, 0xA002) {
                set_number(t, little, e, width);
            }
            if let Some(e) = entry_offset(&rd, exif_ifd, 0xA003) {
                set_number(t, little, e, height);
            }
        }
    }
}
