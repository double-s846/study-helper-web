const $ = (id) => document.getElementById(id);

const STORAGE_KEYS = {
  todos: "study-helper.todos",
  records: "study-helper.records",
  habits: "study-helper.habits",
  settings: "study-helper.settings"
};

const MODE_LABELS = {
  focus: "专注时间",
  short: "短休息",
  long: "长休息"
};

const WEEK_DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getWeekStart(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return toDateString(copy);
}

function addDays(date, offset) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + offset);
  return copy;
}

function formatClock(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${pad(hours)}:${pad(mins)}`;
}

function loadData(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function normalizeSubject(subject) {
  return subject === "数学" ? "科研" : (subject || "综合");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function showPage(pageName) {
  document.querySelectorAll(".app-page").forEach((page) => {
    page.classList.toggle("active", page.dataset.page === pageName);
  });

  document.querySelectorAll("[data-page-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.pageLink === pageName);
  });
}

document.querySelectorAll("[data-page-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const pageName = link.dataset.pageLink;
    window.history.replaceState(null, "", `#${pageName}`);
    showPage(pageName);
  });
});

const initialPage = ["timer", "todo", "stats"].includes(location.hash.slice(1))
  ? location.hash.slice(1)
  : "timer";
showPage(initialPage);

let settings = loadData(STORAGE_KEYS.settings, {
  dark: false,
  autoFocus: false,
  autoTodo: true,
  dailyGoal: 120
});

function renderSettings() {
  document.body.classList.toggle("dark", settings.dark);
  $("themeToggle").textContent = settings.dark ? "浅色模式" : "深色模式";
  $("autoFocusToggle").checked = settings.autoFocus;
  $("autoTodoToggle").checked = settings.autoTodo;
  $("dailyGoalInput").value = settings.dailyGoal;
}

function saveSettings() {
  saveData(STORAGE_KEYS.settings, settings);
  renderSettings();
}

$("themeToggle").addEventListener("click", () => {
  settings.dark = !settings.dark;
  saveSettings();
});

$("autoFocusToggle").addEventListener("change", (event) => {
  settings.autoFocus = event.target.checked;
  saveSettings();
});

$("autoTodoToggle").addEventListener("change", (event) => {
  settings.autoTodo = event.target.checked;
  saveSettings();
});

$("dailyGoalInput").addEventListener("change", (event) => {
  settings.dailyGoal = Math.min(Math.max(Number(event.target.value) || 120, 10), 720);
  saveSettings();
  renderStats();
});

let timer = null;
let isRunning = false;
let currentMode = "focus";
let totalSeconds = 25 * 60;
let leftSeconds = totalSeconds;
let focusRounds = 0;
let activeTask = "";

const timerText = $("timerText");
const timerRing = $("timerRing");
const timerState = $("timerState");
const focusInput = $("focusInput");
const shortBreakInput = $("shortBreakInput");
const longBreakInput = $("longBreakInput");

function getModeMinutes(mode = currentMode) {
  if (mode === "short") return Math.min(Math.max(Number(shortBreakInput.value) || 5, 1), 60);
  if (mode === "long") return Math.min(Math.max(Number(longBreakInput.value) || 15, 1), 90);
  return Math.min(Math.max(Number(focusInput.value) || 25, 1), 120);
}

function updateRoundDots() {
  document.querySelectorAll("#roundDots span").forEach((dot, index) => {
    dot.classList.toggle("active", index <= (focusRounds % 4));
  });
}

function updateTimerUI() {
  const minutes = Math.floor(leftSeconds / 60);
  const seconds = leftSeconds % 60;
  const progress = totalSeconds > 0 ? (1 - leftSeconds / totalSeconds) * 360 : 0;

  timerText.textContent = `${pad(minutes)}:${pad(seconds)}`;
  timerRing.style.background = `conic-gradient(var(--hot) ${progress}deg, var(--hot-soft) ${progress}deg)`;
  timerState.textContent = MODE_LABELS[currentMode];
  $("activeTaskText").textContent = activeTask ? `当前待办：${activeTask}` : "当前没有绑定待办";
  updateRoundDots();
}

function resetTimerForMode(mode = currentMode) {
  window.clearInterval(timer);
  isRunning = false;
  currentMode = mode;
  totalSeconds = getModeMinutes(mode) * 60;
  leftSeconds = totalSeconds;
  updateTimerUI();

  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === currentMode);
  });
}

function finishCurrentTimer() {
  window.clearInterval(timer);
  isRunning = false;

  if (currentMode === "focus") {
    focusRounds += 1;
    addStudyRecord(getModeMinutes("focus"));
    const nextMode = focusRounds % 4 === 0 ? "long" : "short";
    resetTimerForMode(nextMode);
    if (settings.autoFocus) startTimer();
    return;
  }

  resetTimerForMode("focus");
  if (settings.autoFocus) startTimer();
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;

  timer = window.setInterval(() => {
    if (leftSeconds <= 0) {
      finishCurrentTimer();
      return;
    }

    leftSeconds -= 1;
    updateTimerUI();
  }, 1000);
}

function pauseTimer() {
  window.clearInterval(timer);
  isRunning = false;
}

$("startBtn").addEventListener("click", startTimer);
$("pauseBtn").addEventListener("click", pauseTimer);
$("resetBtn").addEventListener("click", () => resetTimerForMode(currentMode));
$("openSettingsBtn").addEventListener("click", () => {
  $("settingsPanel").classList.toggle("open");
});

document.querySelectorAll(".mode-tab").forEach((button) => {
  button.addEventListener("click", () => resetTimerForMode(button.dataset.mode));
});

[focusInput, shortBreakInput, longBreakInput].forEach((input) => {
  input.addEventListener("change", () => resetTimerForMode(currentMode));
});

let todos = loadData(STORAGE_KEYS.todos, []);
let currentFilter = "all";

const todoInput = $("todoInput");
const dateInput = $("dateInput");
const todoList = $("todoList");
dateInput.value = toDateString();

function getVisibleTodos() {
  return [...todos]
    .filter((todo) => {
      if (currentFilter === "finished") return todo.finished;
      if (currentFilter === "unfinished") return !todo.finished;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function renderTodos() {
  const visibleTodos = getVisibleTodos();
  const unfinishedCount = todos.filter((todo) => !todo.finished).length;
  $("todoCount").textContent = `${unfinishedCount} 项待完成`;

  if (visibleTodos.length === 0) {
    todoList.innerHTML = `<li class="empty">暂无待办事项，添加一个学习任务吧。</li>`;
    return;
  }

  todoList.innerHTML = visibleTodos.map((todo) => `
    <li class="todo-item ${todo.finished ? "done" : ""}" data-id="${todo.id}">
      <input class="todo-check" type="checkbox" ${todo.finished ? "checked" : ""} aria-label="标记完成" />
      <div>
        <p class="todo-title">${escapeHtml(todo.text)}</p>
        <p class="todo-date">${todo.date}</p>
      </div>
      <div class="todo-actions">
        <button class="start-task" type="button" aria-label="开始待办">始</button>
        <button class="edit" type="button" aria-label="修改待办">改</button>
        <button class="delete" type="button" aria-label="删除待办">删</button>
      </div>
    </li>
  `).join("");
}

$("todoForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = todoInput.value.trim();
  const date = dateInput.value || toDateString();

  if (!text) {
    alert("请输入待办事项。");
    return;
  }

  todos.push({
    id: String(Date.now()),
    text,
    date,
    finished: false
  });

  saveData(STORAGE_KEYS.todos, todos);
  todoInput.value = "";
  renderTodos();
});

todoList.addEventListener("click", (event) => {
  const item = event.target.closest(".todo-item");
  if (!item) return;

  const todo = todos.find((entry) => entry.id === item.dataset.id);
  if (!todo) return;

  if (event.target.classList.contains("todo-check")) {
    todo.finished = event.target.checked;
  }

  if (event.target.classList.contains("start-task")) {
    activeTask = todo.text;
    showPage("timer");
    window.history.replaceState(null, "", "#timer");
    resetTimerForMode("focus");
    if (settings.autoTodo) startTimer();
  }

  if (event.target.classList.contains("delete")) {
    todos = todos.filter((entry) => entry.id !== todo.id);
  }

  if (event.target.classList.contains("edit")) {
    const nextText = prompt("修改待办事项：", todo.text);
    if (nextText && nextText.trim()) {
      todo.text = nextText.trim();
    }
  }

  saveData(STORAGE_KEYS.todos, todos);
  renderTodos();
  updateTimerUI();
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    renderTodos();
  });
});

let habits = loadData(STORAGE_KEYS.habits, []);
const habitInput = $("habitInput");
const habitList = $("habitList");

function isHabitDoneToday(habit) {
  return habit.doneDates.includes(toDateString());
}

function getHabitStreak(habit) {
  let streak = 0;
  let cursor = new Date();

  while (habit.doneDates.includes(toDateString(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function renderHabits() {
  const doneCount = habits.filter(isHabitDoneToday).length;
  $("habitCount").textContent = `${doneCount}/${habits.length}`;

  if (habits.length === 0) {
    habitList.innerHTML = `<li class="empty">还没有每日习惯，可以先添加一个小目标。</li>`;
    return;
  }

  habitList.innerHTML = habits.map((habit) => `
    <li class="habit-item ${isHabitDoneToday(habit) ? "done" : ""}" data-id="${habit.id}">
      <input class="habit-check" type="checkbox" ${isHabitDoneToday(habit) ? "checked" : ""} aria-label="今日打卡" />
      <div>
        <p class="habit-title">${escapeHtml(habit.text)}</p>
        <p class="habit-streak">连续 ${getHabitStreak(habit)} 天</p>
      </div>
      <button class="habit-delete" type="button" aria-label="删除习惯">删</button>
    </li>
  `).join("");
}

$("habitForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = habitInput.value.trim();
  if (!text) {
    alert("请输入习惯内容。");
    return;
  }

  habits.push({
    id: String(Date.now()),
    text,
    doneDates: []
  });
  saveData(STORAGE_KEYS.habits, habits);
  habitInput.value = "";
  renderHabits();
  renderBadges();
});

habitList.addEventListener("click", (event) => {
  const item = event.target.closest(".habit-item");
  if (!item) return;

  const habit = habits.find((entry) => entry.id === item.dataset.id);
  if (!habit) return;

  if (event.target.classList.contains("habit-check")) {
    const today = toDateString();
    if (event.target.checked && !habit.doneDates.includes(today)) {
      habit.doneDates.push(today);
    }
    if (!event.target.checked) {
      habit.doneDates = habit.doneDates.filter((date) => date !== today);
    }
  }

  if (event.target.classList.contains("habit-delete")) {
    habits = habits.filter((entry) => entry.id !== habit.id);
  }

  saveData(STORAGE_KEYS.habits, habits);
  renderHabits();
  renderBadges();
});

let records = loadData(STORAGE_KEYS.records, []);

function addStudyRecord(minutes, subject = "综合") {
  records.push({
    date: toDateString(),
    minutes: Number(minutes),
    subject
  });
  saveData(STORAGE_KEYS.records, records);
  renderStats();
}

function getTotalMinutes(range = "all") {
  const today = toDateString();
  const weekStart = getWeekStart();
  const monthStart = today.slice(0, 8) + "01";

  return records
    .filter((record) => {
      if (range === "today") return record.date === today;
      if (range === "week") return record.date >= weekStart && record.date <= today;
      if (range === "month") return record.date >= monthStart && record.date <= today;
      return true;
    })
    .reduce((sum, record) => sum + record.minutes, 0);
}

function getWeekData() {
  const start = new Date(getWeekStart().replace(/-/g, "/"));
  return Array.from({ length: 7 }, (_, index) => {
    const date = toDateString(addDays(start, index));
    const minutes = records
      .filter((record) => record.date === date)
      .reduce((sum, record) => sum + record.minutes, 0);
    return { date, day: WEEK_DAYS[index], minutes };
  });
}

function renderWeekChart() {
  const data = getWeekData();
  const max = Math.max(...data.map((item) => item.minutes), 60);

  $("weekChart").innerHTML = data.map((item) => `
    <div class="bar">
      <div class="bar-fill" style="height: ${Math.max(item.minutes / max * 190, item.minutes ? 12 : 8)}px"></div>
      <span class="bar-value">${item.minutes}</span>
      <span class="bar-day">${item.day}</span>
    </div>
  `).join("");
}

function getSubjectData() {
  const totals = records.reduce((map, record) => {
    const subject = normalizeSubject(record.subject);
    map[subject] = (map[subject] || 0) + record.minutes;
    return map;
  }, {});

  return Object.entries(totals)
    .map(([subject, minutes]) => ({ subject, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

function renderSubjectChart() {
  const colors = ["#ff5530", "#ff8a65", "#f6c85f", "#8bd3c7", "#9b89f5", "#f28ab2"];
  const data = getSubjectData();
  const total = data.reduce((sum, item) => sum + item.minutes, 0);

  if (total === 0) {
    $("subjectChart").innerHTML = `<div class="empty">暂无科目数据，记录学习时长后会生成饼图。</div>`;
    return;
  }

  let start = 0;
  const segments = data.map((item, index) => {
    const degrees = item.minutes / total * 360;
    const segment = `${colors[index % colors.length]} ${start}deg ${start + degrees}deg`;
    start += degrees;
    return segment;
  }).join(", ");

  const list = data.map((item, index) => `
    <div class="pie-item">
      <span class="pie-dot" style="background: ${colors[index % colors.length]}"></span>
      <span>${item.subject}</span>
      <strong>${item.minutes} 分钟</strong>
    </div>
  `).join("");

  $("subjectChart").innerHTML = `
    <div class="pie-visual" style="background: conic-gradient(${segments})"></div>
    <div class="pie-list">${list}</div>
  `;
}

let chartMode = "bar";

function setChartMode(mode) {
  chartMode = mode;
  $("weekChart").classList.toggle("hidden", mode !== "bar");
  $("subjectChart").classList.toggle("hidden", mode !== "pie");
  $("chartTitle").textContent = mode === "bar" ? "本周学习柱状图" : "科目时间占比饼图";
  $("barChartBtn").classList.toggle("active", mode === "bar");
  $("pieChartBtn").classList.toggle("active", mode === "pie");
}

function renderBadges() {
  const todayTotal = getTotalMinutes("today");
  const weekTotal = getTotalMinutes("week");
  const allTotal = getTotalMinutes("all");
  const longestHabit = habits.reduce((max, habit) => Math.max(max, getHabitStreak(habit)), 0);
  const finishedTodos = todos.filter((todo) => todo.finished).length;
  const subjectCount = getSubjectData().length;

  const badges = [
    { icon: "7", title: "连续专注", desc: "习惯连续 7 天", unlocked: longestHabit >= 7 },
    { icon: "100", title: "百小时学习", desc: "累计学习 100 小时", unlocked: allTotal >= 6000 },
    { icon: "早", title: "早起鸟", desc: "今日完成 30 分钟", unlocked: todayTotal >= 30 },
    { icon: "周", title: "稳定输出", desc: "本周学习 10 小时", unlocked: weekTotal >= 600 },
    { icon: "标", title: "今日达标", desc: "完成每日学习目标", unlocked: todayTotal >= settings.dailyGoal },
    { icon: "清", title: "清单收割", desc: "完成 10 个待办", unlocked: finishedTodos >= 10 },
    { icon: "图", title: "数据玩家", desc: "记录 3 个科目", unlocked: subjectCount >= 3 },
    { icon: "火", title: "长期主义", desc: "累计学习 20 小时", unlocked: allTotal >= 1200 }
  ];

  $("badgeList").innerHTML = badges.map((badge) => `
    <article class="badge ${badge.unlocked ? "unlocked" : ""}">
      <span class="badge-icon">${badge.icon}</span>
      <strong>${badge.title}</strong>
      <p>${badge.unlocked ? "已解锁" : badge.desc}</p>
    </article>
  `).join("");
}

function renderStats() {
  const todayTotal = getTotalMinutes("today");
  const weekTotal = getTotalMinutes("week");

  $("todayMinutes").textContent = todayTotal;
  $("weekMinutes").textContent = weekTotal;
  $("heroTodayMinutes").textContent = formatClock(todayTotal);
  $("dailyGoalText").textContent = `今日目标 ${settings.dailyGoal} 分钟，已完成 ${Math.min(Math.round(todayTotal / settings.dailyGoal * 100), 100)}%`;

  const recent = records.slice(-8).reverse();
  $("recordText").innerHTML = recent.length
    ? recent.map((record) => `${record.date}：${normalizeSubject(record.subject)} 学习 ${record.minutes} 分钟`).join("<br>")
    : "暂无学习记录";

  renderWeekChart();
  renderSubjectChart();
  setChartMode(chartMode);
  renderBadges();
}

$("recordForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const minutes = Number($("manualMinutes").value);

  if (!minutes || minutes <= 0) {
    alert("请输入正确的学习分钟数。");
    return;
  }

  addStudyRecord(minutes, $("subjectInput").value);
  $("manualMinutes").value = "";
});

function buildReport(range) {
  const title = range === "week" ? "学习周报" : "学习月报";
  const total = getTotalMinutes(range);
  const finishedTodos = todos.filter((todo) => todo.finished).length;
  const habitDone = habits.filter(isHabitDoneToday).length;
  const subjectRows = getSubjectData()
    .map((item) => `<li>${item.subject}：${item.minutes} 分钟</li>`)
    .join("");
  const chartRows = getWeekData()
    .map((item) => `<li>${item.day}（${item.date}）：${item.minutes} 分钟</li>`)
    .join("");

  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body { font-family: "Microsoft YaHei", Arial, sans-serif; padding: 32px; color: #202126; }
          h1 { color: #ff5530; }
          section { margin-top: 22px; }
          li { margin: 8px 0; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>生成日期：${toDateString()}</p>
        <section>
          <h2>概览</h2>
          <p>学习总时长：${total} 分钟</p>
          <p>已完成待办：${finishedTodos} 项</p>
          <p>今日习惯打卡：${habitDone}/${habits.length}</p>
        </section>
        <section>
          <h2>本周明细</h2>
          <ul>${chartRows}</ul>
        </section>
        <section>
          <h2>科目分布</h2>
          <ul>${subjectRows || "<li>暂无科目数据</li>"}</ul>
        </section>
      </body>
    </html>
  `;
}

function printReport(range) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    alert("浏览器拦截了弹窗，请允许后重试。");
    return;
  }
  reportWindow.document.write(buildReport(range));
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}

function exportChartImage() {
  if (chartMode === "pie") {
    exportSubjectImage();
    return;
  }

  const data = getWeekData();
  const max = Math.max(...data.map((item) => item.minutes), 60);
  const bars = data.map((item, index) => {
    const height = Math.max(item.minutes / max * 220, item.minutes ? 16 : 8);
    const x = 56 + index * 86;
    const y = 290 - height;
    return `
      <rect x="${x}" y="${y}" width="46" height="${height}" rx="18" fill="#ff5530"/>
      <text x="${x + 23}" y="${y - 10}" text-anchor="middle" font-size="16" fill="#ff5530" font-weight="700">${item.minutes}</text>
      <text x="${x + 23}" y="330" text-anchor="middle" font-size="16" fill="#8a858d">${item.day}</text>
    `;
  }).join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="700" height="390" viewBox="0 0 700 390">
      <rect width="700" height="390" rx="28" fill="#fff7fd"/>
      <text x="40" y="58" font-size="30" fill="#202126" font-weight="700">本周学习柱状图</text>
      ${bars}
      <text x="40" y="362" font-size="15" fill="#8a858d">由个人学习效率小助手生成</text>
    </svg>
  `;

  downloadFile(`学习周报图-${toDateString()}.svg`, svg, "image/svg+xml;charset=utf-8");
}

function exportSubjectImage() {
  const data = getSubjectData();
  const total = data.reduce((sum, item) => sum + item.minutes, 0);
  if (total === 0) {
    alert("暂无科目数据，先记录一次学习时长吧。");
    return;
  }

  const colors = ["#ff5530", "#ff8a65", "#f6c85f", "#8bd3c7", "#9b89f5", "#f28ab2"];
  let offset = 0;
  const circles = data.map((item, index) => {
    const value = item.minutes / total * 100;
    const dash = `${value} ${100 - value}`;
    const circle = `<circle r="78" cx="160" cy="190" fill="transparent" stroke="${colors[index % colors.length]}" stroke-width="54" stroke-dasharray="${dash}" stroke-dashoffset="${25 - offset}" transform="rotate(-90 160 190)"/>`;
    offset += value;
    return circle;
  }).join("");

  const legend = data.map((item, index) => `
    <rect x="330" y="${122 + index * 34}" width="14" height="14" rx="4" fill="${colors[index % colors.length]}"/>
    <text x="354" y="${135 + index * 34}" font-size="16" fill="#202126">${item.subject}：${item.minutes} 分钟</text>
  `).join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="700" height="390" viewBox="0 0 700 390">
      <rect width="700" height="390" rx="28" fill="#fff7fd"/>
      <text x="40" y="58" font-size="30" fill="#202126" font-weight="700">科目时间占比饼图</text>
      ${circles}
      <circle r="50" cx="160" cy="190" fill="#fff7fd"/>
      <text x="160" y="196" text-anchor="middle" font-size="20" fill="#ff5530" font-weight="700">${total} 分钟</text>
      ${legend}
      <text x="40" y="362" font-size="15" fill="#8a858d">由个人学习效率小助手生成</text>
    </svg>
  `;

  downloadFile(`科目占比图-${toDateString()}.svg`, svg, "image/svg+xml;charset=utf-8");
}

$("exportImageBtn").addEventListener("click", exportChartImage);
$("barChartBtn").addEventListener("click", () => setChartMode("bar"));
$("pieChartBtn").addEventListener("click", () => setChartMode("pie"));
$("exportWeekBtn").addEventListener("click", () => printReport("week"));
$("exportMonthBtn").addEventListener("click", () => printReport("month"));

renderSettings();
resetTimerForMode(currentMode);
renderTodos();
renderHabits();
renderStats();
