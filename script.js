"use strict";
async function loadTasks() {
    const response = await fetch("http://localhost:3000/boards/1/tasks");
    const tasks = await response.json();
    console.log(tasks);
}
loadTasks();
