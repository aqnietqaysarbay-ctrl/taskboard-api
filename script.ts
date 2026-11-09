type Status = "todo" | "progress" | "done";

type Board = {
  id: number;
  title: string;
};

type Member = {
  id: number;
  name: string;
  email: string;
};

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: Status;
  assigned_to: number | null;
};

type BoardResponse = {
  board: Board;
  tasks: Task[];
  members: Member[];
};

type MessageResponse = {
  message: string;
};

type LoginResponse = {
  token: string;
};

type ErrorResponse = {
  error?: string;
};

const API_URL: string = "http://localhost:3000";

const boards: Board[] = [];
const tasks: Task[] = [];
const members: Member[] = [];

let currentBoardId: number = 0;
let isRegisterMode: boolean = false;

///////// get elements (safe, no "as", no "any")
function getElement(id: string): HTMLElement {
  const element: HTMLElement | null = document.getElementById(id);
  if (element === null) throw new Error("Missing element: " + id);
  return element;
}

function getInput(id: string): HTMLInputElement {
  const element: HTMLElement = getElement(id);
  if (!(element instanceof HTMLInputElement))
    throw new Error(id + " is not an input");
  return element;
}

function getTextArea(id: string): HTMLTextAreaElement {
  const element: HTMLElement = getElement(id);
  if (!(element instanceof HTMLTextAreaElement))
    throw new Error(id + " is not a textarea");
  return element;
}

function getSelect(id: string): HTMLSelectElement {
  const element: HTMLElement = getElement(id);
  if (!(element instanceof HTMLSelectElement))
    throw new Error(id + " is not a select");
  return element;
}

function getForm(id: string): HTMLFormElement {
  const element: HTMLElement = getElement(id);
  if (!(element instanceof HTMLFormElement))
    throw new Error(id + " is not a form");
  return element;
}

function getDialog(id: string): HTMLDialogElement {
  const element: HTMLElement = getElement(id);
  if (!(element instanceof HTMLDialogElement))
    throw new Error(id + " is not a dialog");
  return element;
}

///////// small helpers
function getStatus(value: string): Status {
  if (value === "progress") return "progress";
  if (value === "done") return "done";
  return "todo";
}

// makes text safe before putting it inside innerHTML
function safe(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showMessage(text: string): void {
  getElement("appMessage").textContent = text;
}

// sends a request and adds the token if we have one
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token: string | null = localStorage.getItem("token");
  if (token) headers["Authorization"] = "Bearer " + token;

  const response: Response = await fetch(API_URL + path, {
    ...options,
    headers: headers,
  });

  // token is old or wrong: go back to the login screen
  if (response.status === 401 && !path.startsWith("/auth/")) {
    logout("Please login again.");
    throw new Error("Please login again.");
  }

  if (!response.ok) {
    let message: string = "Request failed";
    try {
      const body: ErrorResponse = await response.json();
      if (body.error) message = body.error;
    } catch {
      // not JSON, keep the default message
    }
    throw new Error(message);
  }

  const data: T = await response.json();
  return data;
}

///////// login / register / logout
function setAuthMode(register: boolean): void {
  isRegisterMode = register;

  getElement("authTitle").textContent = register ? "Register" : "Login";
  getElement("authSubmitBtn").textContent = register
    ? "Create account"
    : "Login";
  getElement("authToggleBtn").textContent = register
    ? "Have an account? Login"
    : "No account? Register";
  getElement("authMessage").textContent = "";
  getInput("authName").required = register;

  if (register) {
    getElement("nameField").classList.remove("hidden");
  } else {
    getElement("nameField").classList.add("hidden");
  }
}

function showApp(): void {
  getElement("authScreen").classList.add("hidden");
  getElement("app").classList.remove("hidden");
  void loadBoards();
}

function logout(message: string): void {
  localStorage.removeItem("token");

  boards.splice(0, boards.length);
  members.splice(0, members.length);
  tasks.splice(0, tasks.length);
  currentBoardId = 0;

  renderBoards();
  renderMembers();
  renderTasks();
  getElement("boardTitle").textContent = "";

  getElement("authMessage").textContent = message;
  getElement("app").classList.add("hidden");
  getElement("authScreen").classList.remove("hidden");
}

async function submitAuth(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  const name: string = getInput("authName").value.trim();
  const email: string = getInput("authEmail").value.trim();
  const password: string = getInput("authPassword").value;

  try {
    if (isRegisterMode) {
      await request<Member>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: name, email: email, password: password }),
      });
    }

    const result: LoginResponse = await request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password }),
    });

    localStorage.setItem("token", result.token);
    getForm("authForm").reset();
    showApp();
  } catch (error) {
    getElement("authMessage").textContent =
      error instanceof Error ? error.message : "Something went wrong.";
  }
}

///////// show things on the page
function renderBoards(): void {
  let html: string = "";

  for (const board of boards) {
    const active: string = board.id === currentBoardId ? "active" : "";
    html += `<button class="${active}" data-id="${board.id}">${safe(board.title)}</button>`;
  }

  getElement("boardList").innerHTML = html;
}

function renderMembers(): void {
  let membersHtml: string = "";
  let optionsHtml: string = `<option value="">Nobody</option>`;

  for (const member of members) {
    membersHtml += `<span class="member">${safe(member.name)}</span>`;
    optionsHtml += `<option value="${member.id}">${safe(member.name)}</option>`;
  }

  getElement("memberList").innerHTML = membersHtml;
  getSelect("taskAssignee").innerHTML = optionsHtml;
}

function makeTaskCard(task: Task): string {
  let html: string = `<div class="task"><h4>${safe(task.title)}</h4>`;

  if (task.description) {
    html += `<p>${safe(task.description)}</p>`;
  }

  const assigned = members.find(function (member: Member): boolean {
    return member.id === task.assigned_to;
  });

  if (assigned) {
    html += `<small>👤 ${safe(assigned.name)}</small>`;
  }

  return html + `</div>`;
}

function renderTasks(): void {
  let todoHtml: string = "";
  let progressHtml: string = "";
  let doneHtml: string = "";

  let todoCount: number = 0;
  let progressCount: number = 0;
  let doneCount: number = 0;

  for (const task of tasks) {
    const card: string = makeTaskCard(task);

    if (task.status === "progress") {
      progressHtml += card;
      progressCount += 1;
    } else if (task.status === "done") {
      doneHtml += card;
      doneCount += 1;
    } else {
      todoHtml += card;
      todoCount += 1;
    }
  }

  getElement("todo").innerHTML = todoHtml;
  getElement("progress").innerHTML = progressHtml;
  getElement("done").innerHTML = doneHtml;

  getElement("todoCount").textContent = String(todoCount);
  getElement("progressCount").textContent = String(progressCount);
  getElement("doneCount").textContent = String(doneCount);
}

///////// talk to the backend
async function loadBoard(id: number): Promise<void> {
  try {
    const result: BoardResponse = await request<BoardResponse>("/boards/" + id);

    currentBoardId = result.board.id;
    getElement("boardTitle").textContent = result.board.title;

    members.splice(0, members.length);
    for (const member of result.members) members.push(member);

    tasks.splice(0, tasks.length);
    for (const task of result.tasks) tasks.push(task);

    renderBoards();
    renderMembers();
    renderTasks();
    showMessage("Board loaded.");
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : "Could not load board.",
    );
  }
}

async function loadBoards(): Promise<void> {
  try {
    const result: Board[] = await request<Board[]>("/boards");

    boards.splice(0, boards.length);
    for (const board of result) boards.push(board);

    renderBoards();

    const firstBoard = boards[0];

    if (firstBoard) {
      await loadBoard(firstBoard.id);
    } else {
      getElement("boardTitle").textContent = "No boards yet";
      showMessage("Create your first board.");
    }
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : "Could not load boards.",
    );
  }
}

async function createBoard(): Promise<void> {
  const title: string | null = prompt("Board name?");
  if (!title || !title.trim()) return;

  try {
    const board: Board = await request<Board>("/boards", {
      method: "POST",
      body: JSON.stringify({ title: title.trim() }),
    });

    boards.push(board);
    await loadBoard(board.id);
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : "Could not create board.",
    );
  }
}

async function addTask(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (currentBoardId === 0) {
    showMessage("Select a board first.");
    return;
  }

  const title: string = getInput("taskTitle").value.trim();
  if (!title) return;

  const assignee: string = getSelect("taskAssignee").value;

  try {
    await request<Task>("/boards/" + currentBoardId + "/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: title,
        description: getTextArea("taskDescription").value.trim() || null,
        status: getStatus(getSelect("taskStatus").value),
        assigned_to: assignee ? Number(assignee) : null,
      }),
    });

    getForm("taskForm").reset();
    getDialog("taskDialog").close();
    await loadBoard(currentBoardId);
    showMessage("Task created.");
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : "Could not create task.",
    );
  }
}

async function inviteMember(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (currentBoardId === 0) {
    showMessage("Select a board first.");
    return;
  }

  const email: string = getInput("inviteEmail").value.trim();
  if (!email) return;

  try {
    const result: MessageResponse = await request<MessageResponse>(
      "/boards/" + currentBoardId + "/members",
      {
        method: "POST",
        body: JSON.stringify({ email: email }),
      },
    );

    getForm("inviteForm").reset();
    getDialog("inviteDialog").close();
    await loadBoard(currentBoardId);
    showMessage(result.message);
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : "Could not add member.",
    );
  }
}

///////// buttons and forms
function setupEvents(): void {
  getForm("authForm").addEventListener("submit", submitAuth);

  getElement("authToggleBtn").addEventListener("click", function (): void {
    setAuthMode(!isRegisterMode);
  });

  getElement("logoutBtn").addEventListener("click", function (): void {
    logout("");
  });

  getElement("newBoardBtn").addEventListener("click", function (): void {
    void createBoard();
  });

  // one listener for all board buttons in the sidebar
  getElement("boardList").addEventListener(
    "click",
    function (event: Event): void {
      const target: EventTarget | null = event.target;
      if (!(target instanceof HTMLElement)) return;

      const id: string | undefined = target.dataset.id;
      if (id) void loadBoard(Number(id));
    },
  );

  getElement("newTaskBtn").addEventListener("click", function (): void {
    getDialog("taskDialog").showModal();
  });

  document.querySelectorAll(".add-column-task").forEach(function (
    element: Element,
  ): void {
    if (!(element instanceof HTMLElement)) return;

    element.addEventListener("click", function (): void {
      getSelect("taskStatus").value = element.dataset.status || "todo";
      getDialog("taskDialog").showModal();
    });
  });

  getElement("cancelTaskBtn").addEventListener("click", function (): void {
    getDialog("taskDialog").close();
  });

  getForm("taskForm").addEventListener("submit", addTask);

  getElement("inviteBtn").addEventListener("click", function (): void {
    getDialog("inviteDialog").showModal();
  });

  getElement("cancelInviteBtn").addEventListener("click", function (): void {
    getDialog("inviteDialog").close();
  });

  getForm("inviteForm").addEventListener("submit", inviteMember);
}

document.addEventListener("DOMContentLoaded", function (): void {
  setupEvents();
  setAuthMode(false);

  if (localStorage.getItem("token")) {
    showApp();
  } else {
    getElement("authScreen").classList.remove("hidden");
  }
});
