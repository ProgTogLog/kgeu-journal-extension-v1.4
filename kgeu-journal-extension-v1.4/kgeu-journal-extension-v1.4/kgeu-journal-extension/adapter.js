/* Chrome blocks inline event handlers in extension pages. This adapter keeps
   the existing markup declarative and routes its actions from external JS. */
function kgeuArgs(value) {
  return [...value.matchAll(/'([^']*)'/g)].map(match => match[1]);
}

document.getElementById('restore').addEventListener('change', event => {
  restore(event.target.files?.[0]);
});

document.addEventListener('click', event => {
  const element = event.target.closest('[onclick]');
  if (!element) return;

  const action = element.getAttribute('onclick') || '';
  const args = kgeuArgs(action);
  event.preventDefault();

  if (action === 'openImport()') return openImport();
  if (action === 'openLesson()') return openLesson();
  if (action === 'openStudents()') return openStudents();
  if (action === 'renameGroup()') return renameGroup();
  if (action === 'openSettings()') return openSettings();
  if (action === 'exportGrades()') return exportGrades();
  if (action === 'exportStudents()') return exportStudents();
  if (action === 'exportAttendance()') return exportAttendance();
  if (action === 'backup()') return backup();
  if (action === 'closeModal()') return closeModal();
  if (action === "document.getElementById('restore').click()") {
    return document.getElementById('restore').click();
  }
  if (action.startsWith('openLesson(')) return openLesson(args[0]);
  if (action.startsWith('openWork(')) return openWork(args[0]);
  if (action.startsWith('openGrade(')) return openGrade(args[0], args[1]);
  if (action.startsWith('removeStudent(')) return removeStudent(args[0]);
  if (action.startsWith("groupId='")) {
    groupId = args[0];
    selectedLesson = null;
    return render();
  }
  if (action.startsWith("selectedLesson='")) {
    selectedLesson = args[0];
    return render();
  }
  if (action.startsWith("workFilter='")) {
    workFilter = args[0];
    return render();
  }
});

document.addEventListener('change', event => {
  const element = event.target.closest('[onchange]');
  if (!element) return;
  const action = element.getAttribute('onchange') || '';
  if (!action.startsWith('mark(')) return;
  const args = kgeuArgs(action);
  mark(args[0], args[1], element.value);
});
