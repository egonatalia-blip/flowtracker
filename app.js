(function () {
  "use strict";

  var LS = {
    theme: "ff_theme",
    tasks: "ff_tasks",
    habits: "ff_habits",
    categories: "ff_categories",
    seeded: "ff_seeded",
    lock: "ff_lock"
  };

  var DEFAULT_THEME = "light";
  var DEFAULT_CATEGORIES = ["Работа", "Личное", "Учёба"];
  var PRIORITIES = {
    high: { label: "Высокий", color: "danger" },
    medium: { label: "Средний", color: "medium" },
    low: { label: "Низкий", color: "low" }
  };
  var EMOJIS = ["💧", "📚", "🏃", "🧘", "😴", "🥗", "🍎", "💪", "✍️", "🎯", "🚴", "🌅", "🦷", "💤", "📵", "🌿", "🧠", "🤸", "🥤", "🌞"];
  var TASK_FILTERS = [
    { id: "all", label: "Все" },
    { id: "today", label: "Сегодня" },
    { id: "tomorrow", label: "Завтра" },
    { id: "week", label: "На неделе" },
    { id: "overdue", label: "Ждут" },
    { id: "done", label: "Выполнены" }
  ];

  var state = {
    theme: localStorage.getItem(LS.theme) || DEFAULT_THEME,
    tasks: load(LS.tasks, []),
    habits: load(LS.habits, []),
    categories: load(LS.categories, DEFAULT_CATEGORIES),
    filter: "all",
    period: "week"
  };
  var lockData = load(LS.lock, null);
  var sessionUnlocked = false;
  var pending = null;

  var toastTimer = null;
  var currentTaskId = null;
  var currentHabitId = null;
  var selectedPriority = "medium";
  var selectedEmoji = "💧";

  var $ = function (sel) { return document.querySelector(sel); };

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      showToast("Что-то пошло не так. Попробуй ещё раз");
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function toKey(d) {
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }

  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function startOfDay(d) {
    var r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  function todayKey() {
    return toKey(new Date());
  }

  function fmtDate(key) {
    if (!key) return "";
    var parts = key.split("-");
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }

  function weekdayShort(d) {
    return d.toLocaleDateString("ru-RU", { weekday: "short" });
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return "Доброй ночи";
    if (h < 12) return "Доброе утро";
    if (h < 18) return "Добрый день";
    return "Добрый вечер";
  }

  function showToast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.hidden = true;
    }, 2800);
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML.replace(/"/g, "&quot;");
  }

  function escJs(s) {
    var str = String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML.replace(/"/g, "&quot;");
  }

  function hashStr(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  function hashPass(pass, salt) { return hashStr(salt + "::" + pass); }
  function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
  function isLocked() { return lockData && lockData.enabled && !sessionUnlocked; }

  /* ---------------- Theme ---------------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var meta = $("#metaTheme");
    meta.setAttribute("content", theme === "dark" ? "#121212" : "#F8F9FA");
    var btns = document.querySelectorAll("#themeBtns .theme-btn");
    btns.forEach(function (b) {
      b.classList.toggle("active", b.dataset.theme === theme);
    });
  }

  function setTheme(theme) {
    state.theme = theme;
    localStorage.setItem(LS.theme, theme);
    applyTheme(theme);
    renderSettings();
  }

  /* ---------------- Tabs ---------------- */

  function switchTab(id) {
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.id === "view-" + id);
    });
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === id);
    });
    if (id === "tasks") renderTasks();
    if (id === "habits") renderHabits();
    if (id === "kanban") renderKanban();
    if (id === "stats") renderStats();
    if (id === "settings") renderSettings();
  }

  /* ---------------- Modal ---------------- */

  function openSheet(html) {
    var overlay = $("#overlay");
    $("#sheet").innerHTML = html;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

function closeSheet() {
    document.getElementById("overlay").hidden = true;
    document.body.style.overflow = "";
    renderSettings();
  }

  /* ---------------- Tasks ---------------- */

  function isTaskToday(t) {
    return t.due === todayKey();
  }

  function isTaskTomorrow(t) {
    return t.due === toKey(addDays(new Date(), 1));
  }

  function isTaskThisWeek(t) {
    if (!t.due) return false;
    var today = startOfDay(new Date());
    var due = new Date(t.due + "T00:00:00");
    return due >= today && due <= addDays(startOfDay(new Date()), 7);
  }

  function isOverdue(t) {
    if (t.done || !t.due) return false;
    return t.due < todayKey();
  }

  function taskMatches(t, filter) {
    if (filter === "all") return true;
    if (filter === "today") return isTaskToday(t);
    if (filter === "tomorrow") return isTaskTomorrow(t);
    if (filter === "week") return isTaskThisWeek(t);
    if (filter === "overdue") return isOverdue(t);
    if (filter === "done") return t.done;
    return true;
  }

  function renderTaskFilters() {
    var wrap = $("#taskFilters");
    wrap.innerHTML = TASK_FILTERS.map(function (f) {
      return '<button class="chip' + (state.filter === f.id ? " active" : "") + '" data-filter="' + f.id + '">' + f.label + "</button>";
    }).join("");
  }

  function renderTodayProgress() {
    var box = $("#todayProgress");
    if (state.tasks.length === 0) {
      box.hidden = true;
      return;
    }
    var done = state.tasks.filter(function (t) { return t.done; }).length;
    var pct = Math.round((done / state.tasks.length) * 100);
    box.innerHTML =
      '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="progress-text">Выполнено ' + done + " из " + state.tasks.length + (state.tasks.length > 0 && state.tasks.length % 10 === 1 && state.tasks.length % 100 !== 11 ? " задачи" : " задач") + "</div>";
    box.hidden = false;
  }

  function taskCard(t) {
    var p = PRIORITIES[t.priority] || PRIORITIES.medium;
    var overdue = isOverdue(t);
    var dueHtml = t.due
      ? '<span class="due' + (overdue ? " overdue" : "") + '">' + (overdue ? "• " : "") + fmtDate(t.due) + "</span>"
      : "";
    return (
      '<div class="card task-card' + (t.done ? " done" : "") + '">' +
      '<button class="checkbox' + (t.done ? " checked" : "") + '" onclick="FF.toggleTask(\'' + t.id + '\')">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      "</button>" +
      '<div class="task-body">' +
      '<div class="task-title">' + esc(t.title) + "</div>" +
      (t.desc ? '<div class="task-desc">' + esc(t.desc) + "</div>" : "") +
      '<div class="task-meta">' +
      '<span class="pill">' + esc(t.category) + "</span>" +
      '<span class="prio-dot prio-' + p.color + '"></span>' +
      dueHtml +
      "</div>" +
      "</div>" +
      '<div class="task-actions">' +
      '<button onclick="FF.editTask(\'' + t.id + '\')" aria-label="Редактировать">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>' +
      "</button>" +
      '<button class="del" onclick="FF.deleteTask(\'' + t.id + '\')" aria-label="Удалить">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
      "</button>" +
      "</div>" +
      "</div>"
    );
  }

  function renderTasks() {
    renderTaskFilters();
    renderTodayProgress();
    $("#tasksDate").textContent = greeting() + ", " + new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

    var list = state.tasks.filter(function (t) { return taskMatches(t, state.filter); });

    if (list.length === 0) {
      $("#taskList").innerHTML =
        '<div class="empty card"><span class="empty-icon">📋</span><p>Пока задач нет. Добавь первую! 💪</p></div>';
      return;
    }

    var groups = {};
    list.forEach(function (t) {
      var c = t.category || "Без категории";
      (groups[c] = groups[c] || []).push(t);
    });

    var html = Object.keys(groups).map(function (cat) {
      var items = groups[cat]
        .slice()
        .sort(function (a, b) {
          var pa = PRIORITIES[a.priority] ? ["high", "medium", "low"].indexOf(a.priority) : 1;
          var pb = PRIORITIES[b.priority] ? ["high", "medium", "low"].indexOf(b.priority) : 1;
          if (pa !== pb) return pa - pb;
          return (a.due || "9999") < (b.due || "9999") ? -1 : 1;
        })
        .map(taskCard)
        .join("");
      return '<div class="group-title">' + esc(cat) + ' · ' + items.split('<div class="card task-card').length + '</div>' + '<div class="list">' + items + "</div>";
    }).join("");

    $("#taskList").innerHTML = html;
  }

  function taskFormHtml(id) {
    var t = id ? state.tasks.find(function (x) { return x.id === id; }) : null;
    currentTaskId = id || null;
    selectedPriority = t ? (t.priority || "medium") : "medium";
    var cats = state.categories.includes("Без категории") ? state.categories : state.categories.concat([]);
    var options = cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (t && t.category === c ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");
    var catSelect = cats.length
      ? options
      : '<option value="Без категории">Без категории</option>';

    return (
      '<h2>' + (t ? "Редактировать задачу" : "Новая задача") + "</h2>" +
      '<div class="field"><label>Название</label><input class="input" id="tfTitle" value="' + esc(t ? t.title : "") + '" placeholder="Например, отправить отчёт"></div>' +
      '<div class="field"><label>Описание (необязательно)</label><input class="input" id="tfDesc" value="' + esc(t ? t.desc : "") + '" placeholder="Пару слов о задаче"></div>' +
      '<div class="field"><label>Категория</label><select class="input" id="tfCat">' + catSelect + "</select></div>" +
      '<div class="field"><label>Дедлайн (необязательно)</label><input class="input" type="date" id="tfDue" value="' + esc(t && t.due ? t.due : "") + '"></div>' +
      '<div class="field"><label>Приоритет</label><div class="prio-btns">' +
      ["high", "medium", "low"].map(function (p) {
        return '<button type="button" class="prio-btn' + (selectedPriority === p ? " active" : "") + '" data-prio="' + p + '" onclick="FF.setPriority(\'' + p + '\')">' +
          '<span class="prio-dot prio-' + PRIORITIES[p].color + '"></span>' + PRIORITIES[p].label +
          "</button>";
      }).join("") +
      "</div></div>" +
      '<button class="btn-primary" onclick="FF.saveTask()">Сохранить</button>' +
      '<button class="btn-ghost" onclick="FF.closeSheet()">Отмена</button>'
    );
  }

  function openTaskModal(id) {
    openSheet(taskFormHtml(id || null));
  }

  window.openTaskModal = function (id) { openTaskModal(id); };

  function saveTask() {
    var title = $("#tfTitle").value.trim();
    if (!title) {
      showToast("Введи название задачи");
      return;
    }
    var data = {
      title: title,
      desc: $("#tfDesc").value.trim(),
      category: $("#tfCat").value,
      due: $("#tfDue").value || null,
      priority: selectedPriority
    };
    if (currentTaskId) {
      var t = state.tasks.find(function (x) { return x.id === currentTaskId; });
      if (t) Object.assign(t, data);
      showToast("Задача обновлена");
    } else {
      state.tasks.unshift(Object.assign({ id: uid(), done: false, createdAt: todayKey(), completedAt: null }, data));
      showToast("Задача добавлена");
    }
    save(LS.tasks, state.tasks);
    closeSheet();
    renderTasks();
  }

  function toggleTask(id) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = !t.done;
    t.completedAt = t.done ? todayKey() : null;
    save(LS.tasks, state.tasks);
    if (t.done) showToast("Молодец! Задача закрыта 🎉");
    renderKanban();
    renderTasks();
  }

  function editTask(id) {
    openTaskModal(id);
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
    save(LS.tasks, state.tasks);
    showToast("Задача удалена. Если передумаешь — создашь заново");
    renderTasks();
  }

  /* ---------------- Kanban ---------------- */

  var KANBAN_COLS = [
    { id: "todo", title: "К выполнению", dot: "var(--info)" },
    { id: "overdue", title: "Просрочено", dot: "var(--danger)" },
    { id: "done", title: "Готово", dot: "var(--success)" }
  ];
  var kDragTaskId = null;

  function kanbanColFor(t) {
    if (t.done) return "done";
    if (isOverdue(t)) return "overdue";
    return "todo";
  }

  function kanbanCardHtml(t) {
    var p = PRIORITIES[t.priority] || PRIORITIES.medium;
    var overdue = isOverdue(t);
    return (
      '<div class="card kanban-card' + (t.done ? " kanban-done" : "") + '" draggable="true" data-id="' + t.id + '">' +
      '<div class="kanban-tasks-card">' +
      '<button class="checkbox' + (t.done ? " checked" : "") + '" onclick="FF.toggleTask(\'' + t.id + '\')" aria-label="Отметить задачу">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      "</button>" +
      '<div class="kanban-card-title">' + esc(t.title) + "</div>" +
      '<div class="kanban-card-meta">' +
      '<span class="prio-dot prio-' + p.color + '"></span>' +
      (t.due ? '<span class="kanban-card-due' + (overdue ? " overdue" : "") + '">' + fmtDate(t.due) + "</span>" : "") +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderKanban() {
    var board = $("#kanbanBoard");
    var colsHtml = KANBAN_COLS.map(function (col) {
      var tasks = state.tasks.filter(function (t) { return kanbanColFor(t) === col.id; });
      var cards = tasks.map(kanbanCardHtml).join("");
      var empty = tasks.length === 0
        ? '<div class="kanban-empty">Пока пусто</div>'
        : "";
      return (
        '<div class="kanban-col" data-col="' + col.id + '">' +
        '<div class="kanban-head">' +
        '<div class="kanban-title"><span class="dot" style="background:' + col.dot + '"></span>' + col.title + "</div>" +
        '<span class="kanban-count">' + tasks.length + "</span>" +
        "</div>" +
        '<div class="kanban-list">' + cards + empty + "</div>" +
        "</div>"
      );
    }).join("");
    board.innerHTML = colsHtml;
  }

  function kanbanMoveTo(taskId, colId) {
    var t = state.tasks.find(function (x) { return x.id === taskId; });
    if (!t) return;
    if (colId === "done") {
      t.done = true;
      t.completedAt = todayKey();
      showToast("Задача закрыта 🎉");
    } else {
      t.done = false;
      t.completedAt = null;
      if (colId === "todo" && isOverdue(t)) {
        t.due = todayKey();
        showToast("Дедлайн перенесён на сегодня");
      } else if (colId === "todo") {
        showToast("Задача в «К выполнению»");
      } else {
        showToast("Задача осталась просроченной");
      }
    }
    save(LS.tasks, state.tasks);
    renderKanban();
    if (isTaskToday(t)) renderTasks();
  }

  /* ---------------- Habits ---------------- */

  function habitStreak(h) {
    var d = startOfDay(new Date());
    if (!h.completions[toKey(d)]) d.setDate(d.getDate() - 1);
    var streak = 0;
    while (h.completions[toKey(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function weekDots(h) {
    var out = "";
    var today = startOfDay(new Date());
    for (var i = 6; i >= 0; i--) {
      var key = toKey(addDays(today, -i));
      out += '<span class="dot' + (h.completions[key] ? " on" : "") + '"></span>';
    }
    return '<div class="week-dots">' + out + "</div>";
  }

  function renderCalendar() {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var first = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var offset = (first.getDay() + 6) % 7;
    var monthLabel = now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    var wk = Array.from({ length: 7 }, function (_, i) {
      return new Date(year, month, i - offset + 1).toLocaleDateString("ru-RU", { weekday: "narrow" });
    });
    var grid = wk.map(function (w) { return '<div class="day wday">' + w + "</div>"; }).join("");
    for (var d = 1; d <= daysInMonth; d++) {
      var key = toKey(new Date(year, month, d));
      var done = state.habits.some(function (h) { return h.completions[key]; });
      var isToday = key === todayKey();
      grid += '<div class="day' + (done ? " filled" : "") + (isToday ? " today" : "") + '">' + d + "</div>";
    }
    $("#habitCalendar").innerHTML =
      '<div class="calendar">' +
      '<div class="calendar-head"><span>Календарь</span><span class="cal-month" style="text-transform:capitalize">' + monthLabel + "</span></div>" +
      '<div class="cal-grid">' + grid + "</div>" +
      "</div>";
  }

  function habitCard(h) {
    var streak = habitStreak(h);
    var doneToday = !!h.completions[todayKey()];
    return (
      '<div class="card habit-card">' +
      '<div class="habit-icon">' + h.icon + "</div>" +
      '<div class="habit-body">' +
      '<div class="habit-name">' + esc(h.name) + "</div>" +
      '<div class="habit-streak' + (streak === 0 ? " empty" : "") + '">' + (streak > 0 ? "🔥 " + streak + (streak % 10 === 1 && streak % 100 !== 11 ? " день" : streak % 10 >= 2 && streak % 10 <= 4 && (streak % 100 < 12 || streak % 100 > 14) ? " дня" : " дней") : "начни сегодня") + "</div>" +
      weekDots(h) +
      "</div>" +
      '<button class="habit-check' + (doneToday ? " on" : "") + '" onclick="FF.toggleHabit(\'' + h.id + '\')" aria-label="Отметить привычку">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      "</button>" +
      "</div>"
    );
  }

  function renderHabits() {
    renderCalendar();
    $("#habitsDate").textContent = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    if (state.habits.length === 0) {
      $("#habitList").innerHTML =
        '<div class="empty card"><span class="empty-icon">🌱</span><p>Привычек пока нет. Добавь первую и начни серию!</p></div>';
      return;
    }
    $("#habitList").innerHTML = state.habits.map(habitCard).join("");
  }

  function habitFormHtml(id) {
    var h = id ? state.habits.find(function (x) { return x.id === id; }) : null;
    currentHabitId = id || null;
    selectedEmoji = h ? h.icon : "💧";
    return (
      '<h2>' + (h ? "Изменить привычку" : "Новая привычка") + "</h2>" +
      '<div class="field"><label>Название</label><input class="input" id="hfName" value="' + esc(h ? h.name : "") + '" placeholder="Например, пить воду"></div>' +
      '<div class="field"><label>Иконка</label><div class="emoji-grid">' +
      EMOJIS.map(function (e) {
        return '<button type="button" class="emoji-btn' + (selectedEmoji === e ? " active" : "") + '" data-emoji="' + e + '" onclick="FF.setEmoji(\'' + e + '\')">' + e + "</button>";
      }).join("") +
      "</div></div>" +
      '<button class="btn-primary" onclick="FF.saveHabit()">' + (h ? "Сохранить" : "Создать привычку") + "</button>" +
      '<button class="btn-ghost" onclick="FF.closeSheet()">Отмена</button>' +
      (h ? '<button class="btn-ghost" style="color:var(--danger)" onclick="FF.deleteHabit(\'' + h.id + '\')">Удалить привычку</button>' : "")
    );
  }

  function openHabitModal(id) {
    openSheet(habitFormHtml(id || null));
  }

  window.openHabitModal = function (id) { openHabitModal(id); };

  function saveHabit() {
    var name = $("#hfName").value.trim();
    if (!name) {
      showToast("Введи название привычки");
      return;
    }
    if (currentHabitId) {
      var h = state.habits.find(function (x) { return x.id === currentHabitId; });
      if (h) { h.name = name; h.icon = selectedEmoji; }
      showToast("Привычка обновлена");
    } else {
      state.habits.push({ id: uid(), name: name, icon: selectedEmoji, createdAt: todayKey(), completions: {} });
      showToast("Привычка создана! Вперёд 💪");
    }
    save(LS.habits, state.habits);
    closeSheet();
    renderHabits();
  }

  function toggleHabit(id) {
    var h = state.habits.find(function (x) { return x.id === id; });
    if (!h) return;
    var key = todayKey();
    if (h.completions[key]) {
      delete h.completions[key];
    } else {
      h.completions[key] = true;
      var s = habitStreak(h);
      if (s === 3) showToast("3 дня подряд! Продолжай в том же духе 🔥");
      else if (s === 7) showToast("Неделя! Ты в потоке ✨");
      else showToast("Готово, привычка отмечена 👍");
    }
    save(LS.habits, state.habits);
    renderHabits();
  }

  function deleteHabit(id) {
    state.habits = state.habits.filter(function (x) { return x.id !== id; });
    save(LS.habits, state.habits);
    closeSheet();
    showToast("Привычка удалена");
    renderHabits();
  }

  /* ---------------- Stats ---------------- */

  function periodDates(p) {
    var end = startOfDay(new Date());
    if (p === "week") return { start: addDays(end, -6), label: "за неделю" };
    if (p === "month") return { start: addDays(end, -29), label: "за месяц" };
    return { start: new Date(end.getFullYear(), 0, 1), label: "за год" };
  }

  function inPeriod(key, start) {
    var parts = key.split("-");
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return d >= startOfDay(start) && d <= addDays(startOfDay(new Date()), 0);
  }

  function buckets(p) {
    if (p === "week") {
      var b = [];
      for (var i = 6; i >= 0; i--) b.push({ key: toKey(addDays(new Date(), -i)), label: weekdayShort(addDays(new Date(), -i)).slice(0, 1) + "." });
      return b;
    }
    if (p === "month") {
      var b2 = [];
      var today = new Date();
      var cur = 1;
      while (cur <= today.getDate()) {
        var end = Math.min(cur + 5, today.getDate());
        b2.push({ key: null, label: cur + "–" + end, isMonthWeek: cur });
        cur = end + 1;
      }
      return b2;
    }
    var b3 = [];
    for (var m = 0; m < 12; m++) {
      var y = new Date().getFullYear();
      var first = toKey(new Date(y, m, 1));
      b3.push({ key: first, label: m + 1, month: m });
    }
    return b3;
  }

  function dateInBucket(dateKey, bk) {
    if (!dateKey) return false;
    if (bk.key) {
      var pk = bk.key.split("-");
      var ck = dateKey.split("-");
      if (bk.month !== undefined) return +ck[1] === bk.month + 1 && +ck[0] === +pk[0];
      return dateKey === bk.key;
    }
    var d = +dateKey.split("-")[2];
    return d >= bk.isMonthWeek && d <= Math.min(bk.isMonthWeek + 5, new Date().getDate());
  }

  function taskInBucket(t, bk) {
    return dateInBucket(t.createdAt, bk);
  }

  function renderStats() {
    var pd = periodDates(state.period);
    var start = pd.start;
    $("#statsRange").textContent = "Продуктивность " + pd.label;

    var created = state.tasks.filter(function (t) { return inPeriod(t.createdAt, start); });
    var done = created.filter(function (t) { return t.done && t.completedAt && inPeriod(t.completedAt, start); });
    var totalNow = state.tasks.length;
    var doneNow = state.tasks.filter(function (t) { return t.done; });
    var overdueNow = state.tasks.filter(isOverdue).length;
    var activeNow = state.tasks.filter(function (t) { return !t.done && !isOverdue(t); }).length;

    var bt = buckets(state.period);
    var max = 1;
    var bars = bt.map(function (bk) {
      var c = state.tasks.filter(function (t) { return taskInBucket(t, bk); }).length;
      var d = state.tasks.filter(function (t) { return t.done && dateInBucket(t.completedAt, bk); }).length;
      max = Math.max(max, c, d);
      return { label: bk.label, c: c, d: d };
    });

    var chartHtml =
      '<div class="chart">' +
      bars.map(function (b) {
        return '<div class="chart-col">' +
          '<div class="chart-bar created" style="height:' + Math.max(2, (b.c / max) * 100) + '%"></div>' +
          '<div class="chart-bar done" style="height:' + Math.max(2, (b.d / max) * 100) + '%"></div>' +
          "</div>";
      }).join("") +
      "</div>" +
      '<div class="chart-axis">' + bars.map(function (b) { return "<span>" + b.label + "</span>"; }).join("") + "</div>" +
      '<div class="legend"><span class="l-created">Создано</span><span class="l-done">Выполнено</span></div>';

    var createdCount = created.length;
    var doneCount = done.length;
    var pct = createdCount ? Math.round((doneCount / createdCount) * 100) : 0;

    var habitsBlocks = state.habits.map(function (h) {
      var days = [];
      var key = toKey(start);
      var end = toKey(new Date());
      while (key <= end) {
        if (h.completions[key]) days.push(key);
        key = nextKey(key);
      }
      var total = daysBetween(start, new Date()) + 1;
      var hPct = total ? Math.round((days.length / total) * 100) : 0;
      return (
        '<div class="habit-stat">' +
        '<div class="hs-icon">' + h.icon + "</div>" +
        '<div class="hs-info"><div class="hs-name">' + esc(h.name) + '</div><div class="hs-sub">' + days.length + " из " + total + " " + (total % 10 === 1 && total % 100 !== 11 ? "дня" : "дней") + '</div>' +
        '<div class="hs-bar"><div class="hs-bar-fill" style="width:' + hPct + '%"></div></div></div>' +
        '<div class="hs-pct">' + hPct + "%</div>" +
        "</div>"
      );
    }).join("");

    var bestStreak = state.habits.reduce(function (m, h) { return Math.max(m, bestStreakLifetime(h)); }, 0);
    var totalCompletions = state.habits.reduce(function (m, h) {
      return m + Object.keys(h.completions).filter(function (k) { return inPeriod(k, start); }).length;
    }, 0);

    $("#statsBody").innerHTML =
      '<div class="stats-block"><h2>Задачи</h2>' +
      '<div class="chart-wrap">' + chartHtml + "</div>" +
      '<div class="stat-grid">' +
      '<div class="stat-item"><div class="stat-val">' + createdCount + '</div><div class="stat-lbl">Создано ' + pd.label + "</div></div>" +
      '<div class="stat-item"><div class="stat-val">' + doneCount + '</div><div class="stat-lbl">Выполнено (' + pct + "%)</div></div>" +
      '<div class="stat-item"><div class="stat-val">' + activeNow + '</div><div class="stat-lbl">В процессе</div></div>' +
      '<div class="stat-item"><div class="stat-val">' + overdueNow + '</div><div class="stat-lbl">Ждут выполнения</div></div>' +
      "</div></div>" +
      '<div class="stats-block" style="margin-top:20px"><h2>Привычки</h2><div class="chart-wrap">' +
      (state.habits.length ? habitsBlocks : '<div class="empty"><span class="empty-icon">🌱</span><p>Добавь привычки, чтобы видеть прогресс</p></div>') +
      "</div></div>" +
      '<div class="stats-block" style="margin-top:20px"><h2>Достижения</h2><div class="achieve-grid">' +
      '<div class="achieve"><div class="a-icon">🔥</div><div class="a-val">' + bestStreak + '</div><div class="a-lbl">Лучшая серия</div></div>' +
      '<div class="achieve"><div class="a-icon">✅</div><div class="a-val">' + doneCount + '</div><div class="a-lbl">Задач закрыто</div></div>' +
      '<div class="achieve"><div class="a-icon">💧</div><div class="a-val">' + totalCompletions + '</div><div class="a-lbl">Отметок привычек</div></div>' +
      '<div class="achieve"><div class="a-icon">⚡</div><div class="a-val">' + (totalNow ? Math.round((doneNow.length / totalNow) * 100) : 0) + '%</div><div class="a-lbl">Выполнено задач</div></div>' +
      "</div></div>";
  }

  function nextKey(key) {
    var p = key.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + 1);
    return toKey(d);
  }

  function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  }

  function bestStreakLifetime(h) {
    var keys = Object.keys(h.completions).slice().sort();
    var best = 0;
    var cur = 0;
    var prev = null;
    keys.forEach(function (k) {
      cur = prev && k === nextKey(prev) ? cur + 1 : 1;
      best = Math.max(best, cur);
      prev = k;
    });
    return best;
  }

  /* ---------------- Settings ---------------- */

  function renderSettings() {
    var themeBtns =
      '<div class="theme-btns" id="themeBtns">' +
      '<button class="theme-btn' + (state.theme === "light" ? " active" : "") + '" data-theme="light" onclick="FF.setTheme(\'light\')">🌞 Светлая</button>' +
      '<button class="theme-btn' + (state.theme === "dark" ? " active" : "") + '" data-theme="dark" onclick="FF.setTheme(\'dark\')">🌙 Тёмная</button>' +
      "</div>";

    var cats = state.categories.map(function (c) {
      return '<span class="cat-pill">' + esc(c) + '<button onclick="FF.removeCategory(\'' + escJs(c) + '\')">×</button></span>';
    }).join("");

    $("#settingsBody").innerHTML =
      '<div class="card" style="display:flex;align-items:center;gap:16px">' +
      '<div class="habit-icon" style="width:56px;height:56px;border-radius:18px;font-size:26px">👤</div>' +
      '<div style="flex:1"><div style="font-size:17px;font-weight:700">Пользователь</div>' +
      '<div style="font-size:14px;color:var(--muted)">' + esc(currentUser()) + '</div></div>' +
      "</div>" +
      '<div class="settings-title">Внешний вид</div>' +
      '<div class="settings-card"><div class="setting-row"><div class="setting-label"><div class="l-main">Тема оформления</div><div class="l-sub">Сохраняется на этом устройстве</div></div></div><div style="padding:2px 0 12px">' + themeBtns + "</div></div>" +
      '<div class="settings-title">Категории</div>' +
      '<div class="settings-card"><div class="setting-row"><div class="setting-label"><div class="l-main">Категории задач</div></div></div>' +
      '<div class="cat-list">' + (cats || '<span style="font-size:13px;color:var(--faint)">Категорий пока нет</span>') + "</div>" +
      '<div class="cat-add"><input class="input" id="newCat" placeholder="Новая категория"><button class="btn-ghost" style="width:auto;flex-shrink:0;padding:0 12px" onclick="FF.addCategory()">Добавить</button></div>' +
      "</div>" +
      '<div class="settings-title">Данные</div>' +
      '<div class="settings-card">' +
      '<div class="setting-row"><div class="setting-label"><div class="l-main">Экспорт данных</div><div class="l-sub">Скачать задачи и привычки в CSV</div></div><button class="btn-secondary" style="width:auto;padding:9px 14px" onclick="FF.exportData()">Скачать</button></div>' +
      '<div class="setting-row"><div class="setting-label"><div class="l-main">Сбросить данные</div><div class="l-sub">Удалит все задачи и привычки</div></div><button class="btn-secondary btn-danger" style="width:auto;padding:9px 14px" onclick="FF.resetData()">Сброс</button></div>' +
      "</div>" +
      '<div class="settings-title">Учётная запись</div>' +
      '<div class="settings-card">' +
      '<div class="setting-row"><div class="setting-label"><div class="l-main">Пользователь</div><div class="l-sub">' + esc(currentUser()) + '</div></div></div>' +
      (lockData && lockData.phone ? '<div class="setting-row"><div class="setting-label"><div class="l-main">Телефон</div><div class="l-sub">' + esc(maskPhone(lockData.phone)) + '</div></div></div>' : '') +
      '<div class="setting-row"><div class="setting-label"><div class="l-main">Сменить пароль</div><div class="l-sub">Обновить пароль для входа</div></div><button class="btn-secondary" style="width:auto;padding:9px 14px" data-action="lock-change">Изменить</button></div>' +
      "</div>" +
      '<div class="settings-title">О приложении</div>' +
      '<div class="settings-card">' +
      '<div style="display:flex;align-items:center;gap:14px;padding:14px 0"><img src="logo.png" width="56" height="56" alt="FocusFlow" style="border-radius:16px">' +
      '<div><div style="font-size:18px;font-weight:700">FocusFlow</div><div style="font-size:14px;color:var(--muted)">Твой ритм продуктивности</div><div style="font-size:12px;color:var(--faint);margin-top:2px">v1.0.0 © FocusFlow</div></div></div>' +
      "</div>" +
      '<button class="btn-ghost" style="color:var(--danger);margin-top:8px" onclick="FF.aboutApp()">Оценить приложение ⭐</button>';

    applyTheme(state.theme);
  }

  function addCategory() {
    var input = $("#newCat");
    var v = input.value.trim();
    if (!v) return;
    if (state.categories.includes(v)) {
      showToast("Такая категория уже есть");
      return;
    }
    state.categories.push(v);
    save(LS.categories, state.categories);
    renderSettings();
    showToast("Категория добавлена");
  }

  function removeCategory(name) {
    state.categories = state.categories.filter(function (c) { return c !== name; });
    save(LS.categories, state.categories);
    renderSettings();
    showToast("Категория удалена");
  }

  function exportData() {
    var rows = [["Тип", "Название", "Категория", "Дедлайн", "Статус", "Дата"]];
    state.tasks.forEach(function (t) {
      rows.push(["Задача", t.title, t.category, t.due || "", t.done ? "Выполнена" : "Активна", t.createdAt]);
    });
    state.habits.forEach(function (h) {
      rows.push(["Привычка", h.name, "", "", Object.keys(h.completions).length + " выполнений", h.createdAt]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\r\n");
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "focusflow-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Твоя статистика готова к скачиванию 📊");
  }

  function resetData() {
    if (confirm("Удалить все данные приложения?")) {
      ["ff_tasks", "ff_habits"].forEach(function (k) { localStorage.removeItem(k); });
      state.tasks = [];
      state.habits = [];
      renderStats();
      showToast("Данные сброшены");
    }
  }

  function aboutApp() {
    showToast("Спасибо! Твоя поддержка важна 💜");
  }

  /* ---------- Auth ---------- */

  function renderLock(mode) {
    var el = document.getElementById("lockScreen");
    if (mode === 'register') {
      el.innerHTML = '<div class="lock-inner">' +
        '<img src="logo.png" width="64" height="64" alt="" style="border-radius:16px">' +
        '<h1 class="lock-title">Добро пожаловать</h1>' +
        '<p class="lock-sub">Создай аккаунт, чтобы пользоваться FocusFlow</p>' +
        '<div class="field"><input class="input" id="rkName" placeholder="Имя пользователя"></div>' +
        '<div class="field"><input class="input" id="rkPhone" type="tel" inputmode="tel" placeholder="Телефон для входа по коду"></div>' +
        '<div class="field"><input class="input" id="rkPass" type="password" placeholder="Пароль (мин. 4 символа)"></div>' +
        '<div class="field"><input class="input" id="rkPass2" type="password" placeholder="Повторите пароль"></div>' +
        '<button class="btn-primary" data-action="register-done">Зарегистрироваться</button>' +
        '</div>';
    } else if (mode === 'forgot') {
      el.innerHTML = '<div class="lock-inner">' +
        '<h2 class="lock-title">Забыли пароль?</h2>' +
        '<p class="lock-sub">Введи имя и телефон, чтобы сбросить пароль</p>' +
        '<div class="field"><input class="input" id="fkName" value="' + esc(lockData && lockData.name ? lockData.name : '') + '" placeholder="Имя пользователя"></div>' +
        '<div class="field"><input class="input" id="fkPhone" type="tel" inputmode="tel" value="' + esc(lockData && lockData.phone ? lockData.phone : '') + '" placeholder="Телефон"></div>' +
        '<button class="btn-primary" data-action="forgot-next">Получить код</button>' +
        '<button class="btn-ghost" data-action="back">← Назад</button>' +
        '</div>';
    } else if (mode === 'forgot-code') {
      el.innerHTML = '<div class="lock-inner">' +
        '<h2 class="lock-title">Новый пароль</h2>' +
        '<div class="demo-hint">📱 Демо-режим: SMS не отправляется.<br>Код для сброса: <strong>' + pending.code + '</strong></div>' +
        '<div class="field"><input class="input" id="fkCode" placeholder="6-значный код"></div>' +
        '<div class="field"><input class="input" id="fkPass" type="password" placeholder="Новый пароль"></div>' +
        '<div class="field"><input class="input" id="fkPass2" type="password" placeholder="Повторите пароль"></div>' +
        '<button class="btn-primary" data-action="forgot-save">Сменить пароль</button>' +
        '<button class="btn-ghost" data-action="resend">Переотправить код</button>' +
        '<button class="btn-ghost" data-action="back">← Назад</button>' +
        '</div>';
    } else if (mode === 'code') {
      el.innerHTML = '<div class="lock-inner">' +
        '<h2 class="lock-title">Вход по коду</h2>' +
        '<p class="lock-sub">Резервный вход без пароля — код придёт на телефон</p>' +
        '<div class="field"><input class="input" id="ckPhone" type="tel" inputmode="tel" value="' + esc(lockData && lockData.phone ? lockData.phone : '') + '" placeholder="Телефон"></div>' +
        '<button class="btn-primary" data-action="code-send">Получить код</button>' +
        '<button class="btn-ghost" data-action="back">← Назад</button>' +
        '</div>';
    } else if (mode === 'code-enter') {
      el.innerHTML = '<div class="lock-inner">' +
        '<h2 class="lock-title">Вход по коду</h2>' +
        '<div class="demo-hint">📱 Демо-режим: SMS не отправляется.<br>Код: <strong>' + pending.code + '</strong></div>' +
        '<div class="field"><input class="input" id="ckCode" inputmode="numeric" placeholder="6-значный код"></div>' +
        '<button class="btn-primary" data-action="code-verify">Войти</button>' +
        '<button class="btn-ghost" data-action="code-resend">Переотправить код</button>' +
        '<button class="btn-ghost" data-action="back">← Назад</button>' +
        '</div>';
    } else {
      el.innerHTML = '<div class="lock-inner">' +
        '<img src="logo.png" width="64" height="64" alt="" style="border-radius:16px">' +
        '<h1 class="lock-title">Вход в FocusFlow</h1>' +
        '<p class="lock-sub">Введи имя и пароль</p>' +
        '<div class="field"><input class="input" id="lkName" placeholder="Имя пользователя"></div>' +
        '<div class="field"><input class="input" id="lkPass" type="password" placeholder="Пароль"></div>' +
        '<button class="btn-primary" data-action="login">Войти</button>' +
        '<button class="btn-ghost" style="margin-top:4px" data-action="code">Войти по коду</button>' +
        '<button class="btn-ghost" style="margin-top:2px" data-action="forgot">Забыли пароль?</button>' +
        '</div>';
    }
  }

  function showLock(mode) {
    document.getElementById("lockScreen").hidden = false;
    renderLock(mode || 'login');
  }

  function hideLock() {
    document.getElementById("lockScreen").hidden = true;
  }

  function currentUser() {
    return lockData && lockData.name ? lockData.name : '';
  }

  function normPhone(p) {
    return String(p || '').replace(/\D/g, '');
  }

  function validPhone(p) {
    var d = normPhone(p);
    return d.length >= 10 && d.length <= 15;
  }

  function maskPhone(p) {
    var d = normPhone(p);
    if (!d) return '';
    var tail = d.slice(-2);
    return "+7 ••• ••• ••" + tail;
  }

  function register() {
    var name = document.getElementById("rkName").value.trim();
    var phone = document.getElementById("rkPhone").value.trim();
    var p1 = document.getElementById("rkPass").value;
    var p2 = document.getElementById("rkPass2").value;
    if (!name || name.length < 2) { showToast("Введи имя (минимум 2 символа)"); return; }
    if (!validPhone(phone)) { showToast("Введи корректный номер телефона"); return; }
    if (!p1 || p1.length < 4) { showToast("Пароль минимум 4 символа"); return; }
    if (p1 !== p2) { showToast("Пароли не совпадают"); return; }
    var salt = uid();
    lockData = { name: name, phone: normPhone(phone), salt: salt, hash: hashPass(p1, salt) };
    save(LS.lock, lockData);
    pending = null;
    sessionUnlocked = true;
    hideLock();
    renderSettings();
    showToast("Аккаунт создан, добро пожаловать ✨");
  }

  function login() {
    var name = document.getElementById("lkName").value.trim();
    var pass = document.getElementById("lkPass").value;
    if (!lockData || !lockData.name) { showToast("Сначала зарегистрируйся"); showLock('register'); return; }
    if (name === lockData.name && hashPass(pass, lockData.salt) === lockData.hash) {
      sessionUnlocked = true;
      pending = null;
      hideLock();
      renderSettings();
      showToast("Добро пожаловать ✨");
    } else {
      showToast("Неверное имя или пароль");
    }
  }

  function forgotNext() {
    var name = document.getElementById("fkName").value.trim();
    var phone = document.getElementById("fkPhone").value.trim();
    if (!lockData || name !== lockData.name) { showToast("Имя пользователя не совпадает"); return; }
    if (!validPhone(phone)) { showToast("Введи корректный номер телефона"); return; }
    var p = normPhone(phone);
    if (lockData.phone && p !== lockData.phone) { showToast("Телефон не совпадает с аккаунтом"); return; }
    if (!lockData.phone) lockData.phone = p;
    pending = { code: genCode(), phone: p };
    renderLock('forgot-code');
  }

  function resetPass() {
    var code = document.getElementById("fkCode").value.trim();
    var p1 = document.getElementById("fkPass").value;
    var p2 = document.getElementById("fkPass2").value;
    if (code !== pending.code) { showToast("Неверный код"); return; }
    var p = normPhone(pending.phone || '');
    if (!lockData.phone) { lockData.phone = p; } else if (p !== lockData.phone) { showToast("Телефон не совпадает с аккаунтом"); return; }
    if (!p1 || p1.length < 4) { showToast("Пароль минимум 4 символа"); return; }
    if (p1 !== p2) { showToast("Пароли не совпадают"); return; }
    lockData.hash = hashPass(p1, lockData.salt);
    save(LS.lock, lockData);
    pending = null;
    sessionUnlocked = true;
    hideLock();
    renderSettings();
    showToast("Пароль обновлён");
  }

  function sendCode() {
    var phone = document.getElementById("ckPhone").value.trim();
    if (!lockData || !lockData.name) { showToast("Сначала зарегистрируйся"); showLock('register'); return; }
    if (!validPhone(phone)) { showToast("Введи корректный номер телефона"); return; }
    pending = { code: genCode(), phone: normPhone(phone) };
    renderLock('code-enter');
  }

  function verifyCode() {
    var code = document.getElementById("ckCode").value.trim();
    if (code !== pending.code) { showToast("Неверный код"); return; }
    var p = normPhone(pending.phone || '');
    if (!lockData.phone) { lockData.phone = p; } else if (p !== lockData.phone) { showToast("Телефон не совпадает с аккаунтом"); return; }
    save(LS.lock, lockData);
    pending = null;
    sessionUnlocked = true;
    hideLock();
    renderSettings();
    showToast("Вход по коду выполнен ✨");
  }

  function openChangePass() {
    openSheet('<h2>Сменить пароль</h2>' +
      '<div class="field"><label>Текущий пароль</label><input class="input" id="cpCur" type="password" placeholder="Текущий пароль"></div>' +
      '<div class="field"><label>Новый пароль</label><input class="input" id="cpNew" type="password" placeholder="Минимум 4 символа"></div>' +
      '<div class="field"><label>Повторите пароль</label><input class="input" id="cpNew2" type="password" placeholder="Ещё раз пароль"></div>' +
      '<div class="btn-row">' +
      '<button class="btn-primary" data-action="save-change">Сохранить</button>' +
      '<button class="btn-ghost" onclick="FF.closeSheet()">Отмена</button></div>');
  }

  function saveChangePass() {
    var cur = document.getElementById("cpCur").value;
    var p1 = document.getElementById("cpNew").value;
    var p2 = document.getElementById("cpNew2").value;
    if (hashPass(cur, lockData.salt) !== lockData.hash) { showToast("Неверный текущий пароль"); return; }
    if (!p1 || p1.length < 4) { showToast("Новый пароль минимум 4 символа"); return; }
    if (p1 !== p2) { showToast("Пароли не совпадают"); return; }
    lockData.hash = hashPass(p1, lockData.salt);
    save(LS.lock, lockData);
    closeSheet();
    showToast("Пароль обновлён ✅");
  }

  /* ---------------- Exports / helpers for inline handlers ---------------- */

  window.FF = {
    setPriority: function (p) { selectedPriority = p; document.querySelectorAll(".prio-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.prio === p); }); },
    setEmoji: function (e) { selectedEmoji = e; document.querySelectorAll(".emoji-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.emoji === e); }); },
    saveTask: saveTask,
    toggleTask: toggleTask,
    editTask: editTask,
    deleteTask: deleteTask,
    saveHabit: saveHabit,
    toggleHabit: toggleHabit,
    deleteHabit: deleteHabit,
    closeSheet: closeSheet,
    setTheme: setTheme,
    addCategory: addCategory,
    removeCategory: removeCategory,
    exportData: exportData,
    resetData: resetData,
    aboutApp: aboutApp,
    register: register,
    login: login,
    resetPass: resetPass,
    openChangePass: openChangePass,
    saveChangePass: saveChangePass,
    renderKanban: renderKanban,
    kanbanMoveTo: kanbanMoveTo
  };

  /* ---------------- Init ---------------- */

  function seed() {
    if (localStorage.getItem(LS.seeded)) return;
    var t = new Date();
    state.tasks = [
      { id: uid(), title: "Спланировать день", desc: "Разбор приоритетов на сегодня", category: "Личное", priority: "high", due: toKey(t), done: false, createdAt: toKey(t), completedAt: null },
      { id: uid(), title: "Отправить отчёт", desc: "", category: "Работа", priority: "medium", due: toKey(addDays(t, 1)), done: false, createdAt: toKey(t), completedAt: null },
      { id: uid(), title: "Повторить конспект", desc: "Глава 3–4", category: "Учёба", priority: "low", due: toKey(addDays(t, 3)), done: true, createdAt: toKey(addDays(t, -1)), completedAt: toKey(t) }
    ];
    state.habits = [
      { id: uid(), name: "Пить воду", icon: "💧", createdAt: toKey(addDays(t, -5)), completions: {} },
      { id: uid(), name: "Читать 20 минут", icon: "📚", createdAt: toKey(addDays(t, -3)), completions: {} }
    ];
    state.habits[0].completions[toKey(addDays(t, -5))] = true;
    state.habits[0].completions[toKey(addDays(t, -4))] = true;
    state.habits[0].completions[toKey(addDays(t, -3))] = true;
    state.habits[0].completions[toKey(addDays(t, -2))] = true;
    state.habits[0].completions[toKey(addDays(t, -1))] = true;
    state.habits[1].completions[toKey(addDays(t, -2))] = true;
    state.habits[1].completions[toKey(addDays(t, -1))] = true;
    save(LS.tasks, state.tasks);
    save(LS.habits, state.habits);
    save(LS.categories, state.categories);
    localStorage.setItem(LS.seeded, "1");
  }

  function init() {
    seed();
    applyTheme(state.theme);

    var splash = document.getElementById("splash");
    if (splash) {
      setTimeout(function () {
        splash.classList.add("hide");
      }, 1400);
      setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 1900);
    }

    if (lockData && lockData.name) showLock('login'); else showLock('register');

    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.addEventListener("click", function () { switchTab(b.dataset.tab); });
    });
    document.getElementById("taskFilters").addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      state.filter = chip.dataset.filter;
      renderTasks();
    });
    document.getElementById("statsPeriod").addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      state.period = btn.dataset.period;
      document.querySelectorAll("#statsPeriod button").forEach(function (x) { x.classList.toggle("active", x === btn); });
      renderStats();
    });
    document.getElementById("overlay").addEventListener("click", function (e) {
      if (e.target === this) closeSheet();
    });
    document.getElementById("bellBtn").addEventListener("click", function () {
      showToast("Уведомлений пока нет");
    });

    document.getElementById("lockScreen").addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!t) return;
      var a = t.dataset.action;
      if (a === 'register-done') register();
      else if (a === 'login') login();
      else if (a === 'forgot') renderLock('forgot');
      else if (a === 'forgot-next') forgotNext();
      else if (a === 'forgot-save') resetPass();
      else if (a === 'resend') { pending.code = genCode(); renderLock('forgot-code'); showToast("Код переотправлен"); }
      else if (a === 'code') renderLock('code');
      else if (a === 'code-send') sendCode();
      else if (a === 'code-resend') { pending.code = genCode(); renderLock('code-enter'); showToast("Код переотправлен"); }
      else if (a === 'code-verify') verifyCode();
      else if (a === 'back') { if (lockData && lockData.name) renderLock('login'); else renderLock('register'); }
    });

    document.getElementById("settingsBody").addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!t) return;
      var a = t.dataset.action;
      if (a === 'lock-change') openChangePass();
    });
    document.getElementById("sheet").addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!t) return;
      var a = t.dataset.action;
      if (a === 'save-change') saveChangePass();
    });

    document.getElementById("kanbanBoard").addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest('.checkbox')) return;
      var card = e.target.closest ? e.target.closest('.kanban-card') : null;
      if (card) editTask(card.dataset.id);
    });

    document.getElementById("kanbanBoard").addEventListener("dragstart", function (e) {
      var t = e.target.closest ? e.target.closest('[data-id]') : null;
      if (!t) return;
      kDragTaskId = t.dataset.id;
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      setTimeout(function () { t.classList.add("dragging"); }, 0);
    });

    document.getElementById("kanbanBoard").addEventListener("dragend", function (e) {
      var t = e.target.closest ? e.target.closest('[data-id]') : null;
      if (t) t.classList.remove("dragging");
      kDragTaskId = null;
    });

    document.getElementById("kanbanBoard").addEventListener("dragover", function (e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      var col = e.target.closest ? e.target.closest('.kanban-col') : null;
      if (!col) return;
      col.classList.add("drag-over");
    });

    document.getElementById("kanbanBoard").addEventListener("dragleave", function (e) {
      var col = e.target.closest ? e.target.closest('.kanban-col') : null;
      if (col) col.classList.remove("drag-over");
    });

    document.getElementById("kanbanBoard").addEventListener("drop", function (e) {
      e.preventDefault();
      var col = e.target.closest ? e.target.closest('.kanban-col') : null;
      if (col) col.classList.remove("drag-over");
      if (!col || !kDragTaskId) return;
      kanbanMoveTo(kDragTaskId, col.dataset.col);
    });

    switchTab("tasks");
  }

  document.addEventListener("DOMContentLoaded", init);
})();