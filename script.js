(() => {
  'use strict';

  const STORAGE_KEY = 'daylight-tasks-v1';
  const form = document.querySelector('#taskForm');
  const taskInput = document.querySelector('#taskInput');
  const dateInput = document.querySelector('#taskDate');
  const timeInput = document.querySelector('#taskTime');
  const taskList = document.querySelector('#taskList');
  const emptyState = document.querySelector('#emptyState');
  const emptyTitle = document.querySelector('#emptyTitle');
  const emptyMessage = document.querySelector('#emptyMessage');
  const toast = document.querySelector('#toast');
  const dialog = document.querySelector('#confirmDialog');
  let activeFilter = 'all';
  let toastTimer;

  const safeLoad = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter(task => task && typeof task.id === 'string' && typeof task.title === 'string')
        .map(task => ({ id: task.id, title: task.title.slice(0, 120), completed: Boolean(task.completed), date: typeof task.date === 'string' ? task.date : '', time: typeof task.time === 'string' ? task.time : '', createdAt: Number(task.createdAt) || Date.now() }));
    } catch (error) {
      console.warn('Could not read saved tasks:', error);
      return [];
    }
  };
  let tasks = safeLoad();

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.warn('Could not save tasks:', error);
      showToast('Could not save changes in this browser.');
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    if (isToday) return 'Today';
    if (isTomorrow) return 'Tomorrow';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: year === today.getFullYear() ? undefined : 'numeric' }).format(date);
  }

  function formatTime(timeString) {
    if (!timeString || !/^\d{2}:\d{2}$/.test(timeString)) return '';
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function updateCounts() {
    const completed = tasks.filter(task => task.completed).length;
    const pending = tasks.length - completed;
    document.querySelector('#totalStat').textContent = tasks.length;
    document.querySelector('#completedStat').textContent = completed;
    document.querySelector('#pendingStat').textContent = pending;
    document.querySelector('#allCount').textContent = tasks.length;
    document.querySelector('#pendingCount').textContent = pending;
    document.querySelector('#completedCount').textContent = completed;
    document.querySelector('#allTabCount').textContent = tasks.length;
    document.querySelector('#pendingTabCount').textContent = pending;
    document.querySelector('#completedTabCount').textContent = completed;
    document.querySelector('#listSummary').textContent = pending === 1 ? '1 task to focus on' : `${pending} tasks to focus on`;
  }

  function setFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('[data-filter]').forEach(button => {
      const selected = button.dataset.filter === filter;
      if (button.classList.contains('nav-item')) {
        button.classList.toggle('active', selected);
        if (selected) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      } else {
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
    });
    updateCounts();
    renderTasks();
  }

  function visibleTasks() {
    const filtered = tasks.filter(task => activeFilter === 'all' || (activeFilter === 'completed' ? task.completed : !task.completed));
    return filtered.sort((a, b) => Number(a.completed) - Number(b.completed) || b.createdAt - a.createdAt);
  }

  function makeAction(label, symbol, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `task-action${className ? ` ${className}` : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = symbol;
    button.addEventListener('click', handler);
    return button;
  }

  function beginEdit(task, titleNode, card) {
    const editor = document.createElement('form');
    editor.className = 'edit-form';
    editor.style.cssText = 'display:flex;gap:7px;align-items:center;width:100%';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 120;
    input.required = true;
    input.value = task.title;
    input.setAttribute('aria-label', 'Edit task title');
    input.style.cssText = 'flex:1;min-width:0;border:1px solid #d8cff8;border-radius:6px;padding:6px 8px;font:600 12px DM Sans,sans-serif;color:#494458;outline:0';
    const save = document.createElement('button');
    save.type = 'submit'; save.textContent = 'Save';
    save.style.cssText = 'border:0;border-radius:6px;background:#6847df;color:white;padding:7px 9px;font:700 10px DM Sans,sans-serif;cursor:pointer';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.style.cssText = 'border:1px solid #e8e4ee;border-radius:6px;background:white;color:#777184;padding:6px 8px;font:600 10px DM Sans,sans-serif;cursor:pointer';
    editor.append(input, save, cancel);
    titleNode.replaceWith(editor);
    card.querySelector('.task-meta')?.remove();
    input.focus(); input.select();
    editor.addEventListener('submit', event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      task.title = title;
      saveTasks(); renderTasks(); showToast('Task updated.');
    });
    cancel.addEventListener('click', renderTasks);
    input.addEventListener('keydown', event => { if (event.key === 'Escape') renderTasks(); });
  }

  function renderTasks() {
    taskList.replaceChildren();
    const shown = visibleTasks();
    const hasTasks = shown.length > 0;
    emptyState.hidden = hasTasks;
    taskList.hidden = !hasTasks;
    if (!hasTasks) {
      const hasAny = tasks.length > 0;
      emptyTitle.textContent = hasAny ? (activeFilter === 'pending' ? 'All caught up!' : 'Nothing here yet.') : 'A fresh start.';
      emptyMessage.textContent = hasAny ? (activeFilter === 'pending' ? 'You’ve completed everything on your list.' : 'No tasks match this view. Try another filter.') : 'Add your first task and make today count.';
    }
    shown.forEach(task => {
      const card = document.createElement('article');
      card.className = `task-card${task.completed ? ' is-complete' : ''}`;
      card.dataset.id = task.id;
      const check = document.createElement('button');
      check.type = 'button'; check.className = 'task-check'; check.textContent = task.completed ? '✓' : '';
      check.setAttribute('aria-label', task.completed ? `Mark ${task.title} as pending` : `Mark ${task.title} as completed`);
      check.setAttribute('aria-pressed', String(task.completed));
      check.addEventListener('click', () => {
        task.completed = !task.completed;
        saveTasks(); render();
        showToast(task.completed ? 'Nicely done — task completed!' : 'Task moved back to pending.');
      });
      const main = document.createElement('div'); main.className = 'task-main';
      const title = document.createElement('div'); title.className = 'task-title'; title.textContent = task.title;
      main.append(title);
      const dueDate = formatDate(task.date);
      const dueTime = formatTime(task.time);
      if (dueDate || dueTime) {
        const meta = document.createElement('div'); meta.className = 'task-meta';
        if (dueDate) { const date = document.createElement('span'); date.className = 'task-date'; date.textContent = dueDate; meta.append(date); }
        if (dueTime) { const time = document.createElement('span'); time.className = 'task-time'; time.textContent = dueTime; meta.append(time); }
        main.append(meta);
      }
      const due = task.date ? new Date(`${task.date}T00:00:00`) : null;
      if (due && due < new Date(new Date().toDateString()) && !task.completed) card.classList.add('is-overdue');
      const tag = document.createElement('span'); tag.className = 'task-tag'; tag.textContent = task.completed ? 'Done' : 'To do';
      const actions = document.createElement('div'); actions.className = 'task-actions';
      actions.append(makeAction('Edit task', '✎', '', () => beginEdit(task, title, card)));
      actions.append(makeAction('Delete task', '×', 'delete', () => {
        tasks = tasks.filter(item => item.id !== task.id); saveTasks(); render(); showToast('Task deleted.');
      }));
      card.append(check, main, tag, actions); taskList.append(card);
    });
  }

  function render() { updateCounts(); renderTasks(); }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = taskInput.value.trim();
    if (!title) { taskInput.focus(); return; }
    tasks.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, title, completed: false, date: dateInput.value, time: timeInput.value, createdAt: Date.now() });
    saveTasks(); form.reset(); render(); taskInput.focus(); showToast('Task added to your list.');
  });

  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));

  document.querySelector('#clearAllBtn').addEventListener('click', () => {
    if (!tasks.length) { showToast('Your task list is already clear.'); return; }
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else if (window.confirm('Clear all tasks? This cannot be undone.')) clearAll();
  });
  document.querySelector('#confirmClear').addEventListener('click', event => {
    event.preventDefault();
    dialog.close();
    clearAll();
  });
  function clearAll() { const count = tasks.length; tasks = []; saveTasks(); render(); showToast(`${count} ${count === 1 ? 'task' : 'tasks'} cleared.`); }
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  document.querySelector('#todayLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
  setFilter('all');
})();
