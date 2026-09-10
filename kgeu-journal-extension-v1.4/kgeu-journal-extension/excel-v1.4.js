const excelEncoder = new TextEncoder();

function excelEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function excelColumn(index) {
  let value = '';
  while (index >= 0) { value = String.fromCharCode(index % 26 + 65) + value; index = Math.floor(index / 26) - 1; }
  return value;
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function write32(target, value) { target.push(value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255); }
function write16(target, value) { target.push(value & 255, value >>> 8 & 255); }

function zipExcel(files) {
  const out = [], directory = [];
  let offset = 0;
  files.forEach(({ name, text }) => {
    const nameBytes = excelEncoder.encode(name), data = excelEncoder.encode(text), crc = crc32(data);
    write32(out, 0x04034b50); write16(out, 20); write16(out, 0); write16(out, 0); write16(out, 0); write16(out, 0); write32(out, crc); write32(out, data.length); write32(out, data.length); write16(out, nameBytes.length); write16(out, 0); out.push(...nameBytes, ...data);
    write32(directory, 0x02014b50); write16(directory, 20); write16(directory, 20); write16(directory, 0); write16(directory, 0); write16(directory, 0); write16(directory, 0); write32(directory, crc); write32(directory, data.length); write32(directory, data.length); write16(directory, nameBytes.length); write16(directory, 0); write16(directory, 0); write16(directory, 0); write16(directory, 0); write32(directory, 0); write32(directory, offset); directory.push(...nameBytes);
    offset = out.length;
  });
  const directoryOffset = out.length; out.push(...directory); write32(out, 0x06054b50); write16(out, 0); write16(out, 0); write16(out, files.length); write16(out, files.length); write32(out, directory.length); write32(out, directoryOffset); write16(out, 0);
  return new Uint8Array(out);
}

function excelCell(value, address) {
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${address}"><v>${value}</v></c>`;
  return `<c r="${address}" t="inlineStr"><is><t>${excelEscape(value)}</t></is></c>`;
}

function downloadExcel(name, rows) {
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => excelCell(value, excelColumn(columnIndex) + (rowIndex + 1))).join('')}</row>`).join('');
  const files = [
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Журнал" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', text: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>` }
  ];
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([zipExcel(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  link.download = `${name}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

function exportGrades() {
  const workList = works();
  downloadExcel(`${current().name}-баллы`, [['Группа', 'ФИО', ...workList.flatMap(work => [tag(work) + ' посещение', tag(work) + ' выполнение', tag(work) + ' в срок', tag(work) + ' дата сдачи', tag(work) + ' проверка', tag(work) + ' комментарий']), 'Итого', 'Максимум'], ...students().map(student => [current().name, student.name, ...workList.flatMap(work => { const points = score(student.id, work), item = grade(student.id, work.id); return [points.a, points.b, points.c, item?.submitted || '', item?.reviewed ? 'Проверено' : 'Не проверено', item?.comment || '']; }), workList.reduce((sum, work) => sum + score(student.id, work).total, 0), max()])]);
}

function exportStudents() { exportGrades(); }

function exportAttendance() {
  const lessonList = D.lessons.filter(lesson => lesson.groupId === groupId);
  const names = { present: 'Присутствовал', absent: 'Отсутствовал', excused: 'Уважительная причина', late: 'Опоздал' };
  downloadExcel(`${current().name}-посещаемость`, [['Группа', 'ФИО', ...lessonList.map(lesson => `${lesson.date} ${lessonTime(lesson)}`)], ...students().map(student => [current().name, student.name, ...lessonList.map(lesson => names[lesson.attendance[student.id]] || 'Не отмечено')])]);
}
