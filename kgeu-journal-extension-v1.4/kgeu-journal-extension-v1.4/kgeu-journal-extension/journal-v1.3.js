function plusMinutes(time, minutes) {
  const [hours, mins] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function lessonTime(lesson) {
  return lesson.endTime ? `${lesson.time}–${lesson.endTime}` : lesson.time;
}

function attendanceValue(first, second) {
  const priority = { present: 4, late: 3, excused: 2, absent: 1 };
  return (priority[second] || 0) > (priority[first] || 0) ? second : first;
}

function mergeLabLessons() {
  const blocks = new Map();
  D.lessons.forEach(lesson => {
    const work = D.works.find(item => item.id === lesson.workId);
    if (!work || work.kind !== 'lab') return;
    const key = `${lesson.groupId}|${lesson.date}|${lesson.workId}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(lesson);
  });

  const remove = new Set();
  blocks.forEach(lessons => {
    if (lessons.length < 2) return;
    lessons.sort((a, b) => a.time.localeCompare(b.time));
    const main = lessons[0];
    main.endTime = lessons.reduce((last, item) => {
      const end = item.endTime || plusMinutes(item.time, 90);
      return end > last ? end : last;
    }, main.endTime || plusMinutes(main.time, 90));
    lessons.slice(1).forEach(item => {
      Object.entries(item.attendance || {}).forEach(([studentId, value]) => {
        main.attendance[studentId] = attendanceValue(main.attendance[studentId], value);
      });
      remove.add(item.id);
    });
  });
  D.lessons = D.lessons.filter(item => !remove.has(item.id));
}

function importSchedule(rows, week) {
  const groups = new Map(D.groups.map(group => [normalize(group.name), group]));
  const from = week > iso() ? week : iso();
  const until = addDays(week, 7);
  const parsed = rows.map(row => ({
    group: String(row['группа'] || row.group || '').trim(),
    discipline: String(row['дисциплина'] || row.discipline || ''),
    date: String(row['дата'] || row.date || '').slice(0, 10),
    time: String(row['начало'] || row.timeStart || '').replace('-', ':'),
    endTime: String(row['конец'] || row.timeEnd || '').replace('-', ':'),
    room: String(row['аудитория'] || row.aud || '').trim()
  })).filter(item => item.group && item.date && item.time && item.date >= from &&
    normalize(item.discipline).includes(normalize(D.course)) && lessonKind(item.discipline) &&
    !isPastLesson(item.date, item.time)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  D.lessons.forEach(lesson => {
    if (!lesson.source && lesson.date >= from && lesson.date < until && !isPastLesson(lesson.date, lesson.time)) lesson.source = 'kgeu';
  });
  D.lessons = D.lessons.filter(lesson => !(lesson.source === 'kgeu' && lesson.date >= from && lesson.date < until && !isPastLesson(lesson.date, lesson.time)));

  const blocks = new Map();
  const unmatched = new Set();
  parsed.forEach(item => {
    const group = groups.get(normalize(item.group));
    if (!group) { unmatched.add(item.group); return; }
    const kind = lessonKind(item.discipline);
    const key = kind === 'lab' ? `${group.id}|${kind}|${item.date}` : `${group.id}|${kind}|${item.date}|${item.time}`;
    if (!blocks.has(key)) blocks.set(key, { group, kind, date: item.date, time: item.time, endTime: item.endTime || plusMinutes(item.time, 90), room: item.room });
    const block = blocks.get(key);
    if (item.time < block.time) block.time = item.time;
    const endTime = item.endTime || plusMinutes(item.time, 90);
    if (endTime > block.endTime) block.endTime = endTime;
  });

  let added = 0;
  const used = new Map(D.groups.map(group => [group.id, new Set(D.lessons.filter(lesson => lesson.groupId === group.id).map(lesson => lesson.workId))]));
  [...blocks.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).forEach(block => {
    const works = D.works.filter(work => work.groupId === block.group.id && work.kind === block.kind).sort((a, b) => a.number - b.number);
    const work = works.find(item => !used.get(block.group.id).has(item.id)) || works.at(-1);
    if (!work) return;
    D.lessons.push({ id: uid(), groupId: block.group.id, workId: work.id, date: block.date, time: block.time, endTime: block.endTime, room: block.room, attendance: {}, source: 'kgeu' });
    used.get(block.group.id).add(work.id);
    if (!work.issued) { work.issued = block.date; work.due = addDays(block.date, D.deadlineDays); }
    added++;
  });
  mergeLabLessons();
  return { added, unmatched: [...unmatched] };
}

function renderLessons() {
  const lessons = D.lessons.filter(item => item.groupId === groupId).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!selectedLesson && lessons.length) selectedLesson = lessons.at(-1).id;
  const lesson = lessons.find(item => item.id === selectedLesson);
  document.getElementById('lessons').innerHTML = `<div class="tools"><div class="tools-left"><button onclick="openLesson()">＋ Добавить пару</button><button class="secondary" onclick="exportAttendance()">↓ Посещаемость CSV</button></div></div><div class="two" style="grid-template-columns:260px minmax(0,1fr);margin-top:0"><div class="card"><h2>Расписание</h2>${lessons.length ? lessons.map(item => { const work = D.works.find(value => value.id === item.workId); return `<button class="group ${item.id === selectedLesson ? 'active' : ''}" onclick="selectedLesson='${item.id}';render()"><b>${fmt(item.date)}</b><div>${lessonTime(item)}<span>${tag(work)}${item.room ? ' · ' + esc(item.room) : ''}</span></div></button>`; }).join('') : '<div class="empty">Добавь первую пару</div>'}</div><div class="panel">${lesson ? attendance(lesson) : '<div class="empty">Выбери пару</div>'}</div></div>`;
}

function attendance(lesson) {
  const work = D.works.find(item => item.id === lesson.workId);
  return `<div class="tools" style="padding:17px 18px 0"><div><b>${fmt(lesson.date)} · ${lessonTime(lesson)}</b><div class="hint">${esc(work.title)}</div></div><button class="secondary small" onclick="openLesson('${lesson.id}')">Изменить</button></div>${students().length ? `<table><thead><tr><th>Студент</th><th>Посещение</th></tr></thead><tbody>${students().map(student => `<tr><td><b>${esc(student.name)}</b></td><td><select onchange="mark('${lesson.id}','${student.id}',this.value)"><option value="">Не отмечено</option>${[['present','Присутствовал'],['absent','Отсутствовал'],['excused','Уважительная причина'],['late','Опоздал']].map(value => `<option value="${value[0]}" ${lesson.attendance[student.id] === value[0] ? 'selected' : ''}>${value[1]}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Сначала добавь студентов в группу</div>'}`;
}

mergeLabLessons();
save();
