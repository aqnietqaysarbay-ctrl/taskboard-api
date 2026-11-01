interface Task {
  id: number;
  title: string;
  description: string | null;
  status: "todo" | "progress" | "done";
}
async function loadTasks() {
  const response = await fetch("http://localhost:3000/boards/1/tasks");
  const tasks: Task[] = await response.json();
  console.log(tasks);
}
loadTasks();
