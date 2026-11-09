"use strict";
// ---------- DATA ----------
const API_URL = "http://localhost:3000";
const boards = [];
const tasks = [];
const members = [];
let currentBoardId = 0;
let nextId = -1; // temporary ids for things that exist only in the page
// ---------- GET ELEMENTS (no "as", no "any") ----------
function getElement(id) {
    const element = document.getElementById(id);
    if (element === null)
        throw new Error("Missing element: " + id);
    return element;
}
function getButton(id) {
    const element = getElement(id);
    if (!(element instanceof HTMLButtonElement))
        throw new Error(id + " is not a button");
    return element;
}
function getInput(id) {
    const element = getElement(id);
    if (!(element instanceof HTMLInputElement))
        throw new Error(id + " is not an input");
    return element;
}
function getTextArea(id) {
    const element = getElement(id);
    if (!(element instanceof HTMLTextAreaElement))
        throw new Error(id + " is not a textarea");
    return element;
}
function getSelect(id) {
    const element = getElement(id);
    if (!(element instanceof HTMLSelectElement))
        throw new Error(id + " is not a select");
    return element;
}
function getForm(id) {
    const element = getElement(id);
    if (!(element instanceof HTMLFormElement))
        throw new Error(id + " is not a form");
    return element;
}
function getDialog(id) {
    const element = getElement(id);
    if (!(element instanceof HTMLDialogElement))
        throw new Error(id + " is not a dialog");
    return element;
}
function getStatus(value) {
    if (value === "progress")
        return "progress";
    if (value === "done")
        return "done";
    return "todo";
}
// ---------- HELPERS ----------
function showMessage(text) {
    getElement("appMessage").textContent = text;
}
async function request(path, options) {
    const response = await fetch(API_URL + path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!response.ok) {
        let message = "Request failed";
        try {
            const errorBody = await response.json();
            if (errorBody.error)
                message = errorBody.error;
        }
        catch {
            // body was not JSON, keep the default message
        }
        throw new Error(message);
    }
    const data = await response.json();
    return data;
}
// ---------- RENDER ----------
function renderBoards() {
    const list = getElement("boardList");
    list.replaceChildren();
    for (const board of boards) {
        const button = document.createElement("button");
        button.textContent = board.title;
        if (board.id === currentBoardId)
            button.classList.add("active");
        button.addEventListener("click", function () {
            void loadBoard(board.id);
        });
        list.appendChild(button);
    }
}
function renderMembers() {
    const list = getElement("memberList");
    list.replaceChildren();
    const select = getSelect("taskAssignee");
    select.replaceChildren();
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Nobody";
    select.appendChild(emptyOption);
    for (const member of members) {
        const badge = document.createElement("span");
        badge.className = "member";
        badge.textContent = member.name;
        list.appendChild(badge);
        const option = document.createElement("option");
        option.value = member.name;
        option.textContent = member.name;
        select.appendChild(option);
    }
}
function makeTaskCard(task) {
    const card = document.createElement("div");
    card.className = "task";
    const title = document.createElement("h4");
    title.textContent = task.title;
    card.appendChild(title);
    if (task.description) {
        const description = document.createElement("p");
        description.textContent = task.description;
        card.appendChild(description);
    }
    if (task.assignee) {
        const assignee = document.createElement("small");
        assignee.textContent = "👤 " + task.assignee;
        card.appendChild(assignee);
    }
    return card;
}
function renderTasks() {
    const todo = getElement("todo");
    const progress = getElement("progress");
    const done = getElement("done");
    todo.replaceChildren();
    progress.replaceChildren();
    done.replaceChildren();
    let todoCount = 0;
    let progressCount = 0;
    let doneCount = 0;
    for (const task of tasks) {
        const card = makeTaskCard(task);
        if (task.status === "progress") {
            progress.appendChild(card);
            progressCount += 1;
        }
        else if (task.status === "done") {
            done.appendChild(card);
            doneCount += 1;
        }
        else {
            todo.appendChild(card);
            todoCount += 1;
        }
    }
    getElement("todoCount").textContent = String(todoCount);
    getElement("progressCount").textContent = String(progressCount);
    getElement("doneCount").textContent = String(doneCount);
}
// ---------- BACKEND ----------
async function loadBoard(id) {
    try {
        const result = await request("/boards/" + id);
        currentBoardId = result.board.id;
        getElement("boardTitle").textContent = result.board.title;
        members.splice(0, members.length);
        for (const member of result.members)
            members.push(member);
        tasks.splice(0, tasks.length);
        for (const task of result.tasks)
            tasks.push(task);
        renderBoards();
        renderMembers();
        renderTasks();
        showMessage("Board loaded. Task and member changes are not saved to the backend yet.");
    }
    catch (error) {
        showMessage(error instanceof Error ? error.message : "Could not load board.");
    }
}
async function loadBoards() {
    try {
        const result = await request("/boards");
        boards.splice(0, boards.length);
        for (const board of result)
            boards.push(board);
        renderBoards();
        const firstBoard = boards[0];
        if (firstBoard) {
            await loadBoard(firstBoard.id);
        }
    }
    catch (error) {
        showMessage(error instanceof Error ? error.message : "Could not load boards.");
    }
}
async function createBoard() {
    const title = prompt("Board name?");
    if (!title || !title.trim())
        return;
    try {
        const board = await request("/boards", {
            method: "POST",
            body: JSON.stringify({ title: title.trim() }),
        });
        boards.push(board);
        await loadBoard(board.id);
    }
    catch (error) {
        showMessage(error instanceof Error ? error.message : "Could not create board.");
    }
}
// ---------- LOCAL ONLY (no backend routes yet) ----------
function addTask(event) {
    event.preventDefault();
    const title = getInput("taskTitle").value.trim();
    if (!title)
        return;
    const task = {
        id: nextId,
        title: title,
        description: getTextArea("taskDescription").value.trim() || null,
        status: getStatus(getSelect("taskStatus").value),
        assignee: getSelect("taskAssignee").value || undefined,
    };
    nextId -= 1;
    tasks.push(task);
    renderTasks();
    getForm("taskForm").reset();
    getDialog("taskDialog").close();
    showMessage("Task added in this page only. Backend task routes are not connected yet.");
}
function inviteMember(event) {
    event.preventDefault();
    const email = getInput("inviteEmail").value.trim();
    if (!email)
        return;
    const member = {
        id: nextId,
        name: email,
        email: email,
    };
    nextId -= 1;
    members.push(member);
    renderMembers();
    getForm("inviteForm").reset();
    getDialog("inviteDialog").close();
    showMessage("Member added in this page only. Backend invite route is not connected yet.");
}
// ---------- EVENTS ----------
function setupEvents() {
    getButton("newBoardBtn").addEventListener("click", function () {
        void createBoard();
    });
    getButton("newTaskBtn").addEventListener("click", function () {
        getDialog("taskDialog").showModal();
    });
    document.querySelectorAll(".add-column-task").forEach(function (element) {
        if (!(element instanceof HTMLButtonElement))
            return;
        element.addEventListener("click", function () {
            getSelect("taskStatus").value = element.dataset.status || "todo";
            getDialog("taskDialog").showModal();
        });
    });
    getButton("cancelTaskBtn").addEventListener("click", function () {
        getDialog("taskDialog").close();
    });
    getForm("taskForm").addEventListener("submit", addTask);
    getButton("inviteBtn").addEventListener("click", function () {
        getDialog("inviteDialog").showModal();
    });
    getButton("cancelInviteBtn").addEventListener("click", function () {
        getDialog("inviteDialog").close();
    });
    getForm("inviteForm").addEventListener("submit", inviteMember);
}
document.addEventListener("DOMContentLoaded", function () {
    setupEvents();
    void loadBoards();
});
