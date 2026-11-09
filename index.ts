import express from "express";
import pg from "pg";
import "dotenv/config";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

let secret: string = "";
if (process.env.JWT_SECRET) {
  secret = process.env.JWT_SECRET;
} else {
  console.error("JWT_SECRET is missing in .env");
}

/////////REGISTER
app.post("/auth/register", async (req, res) => {
  try {
    const body = req.body;
    if (!body.name || !body.email || !body.password) {
      return res.status(400).json({
        error: "Name, email and password are required",
      });
    }
    const hashedPassword = await bcrypt.hash(body.password, 10);

    const existing = await pool.query(
      "SELECT id, password FROM users WHERE email = $1",
      [body.email],
    );

    if (existing.rows.length > 0) {
      const old = existing.rows[0];

      if (old.password) {
        return res.status(400).json({ error: "Email is already registered" });
      }
    }

    const result = await pool.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [body.name, body.email, hashedPassword],
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

//////////LOGIN
app.post("/auth/login", async (req, res) => {
  try {
    const body = req.body;
    if (!body.email || !body.password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      body.email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email" });
    }

    const user = result.rows[0];
    if (!user.password) {
      return res.status(401).json({ error: "Invalid user" });
    }
    const check = await bcrypt.compare(body.password, user.password);
    if (!check) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = jwt.sign({ id: user.id, email: user.email }, secret, {
      expiresIn: "1d",
    });

    return res.status(200).json({
      message: "Login successful",
      token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Login failed" });
  }
});

//////CHECK TOKEN (runs before every /boards route)
app.use("/boards", (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  try {
    const decoded = jwt.verify(header.slice(7), secret);

    if (typeof decoded === "string" || typeof decoded.id !== "number") {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    res.locals.userID = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

////////////////CREATE BOARD
app.post("/boards", async (req, res) => {
  try {
    const userID: number = res.locals.userID;
    const body = req.body;

    if (!body.title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await pool.query(
      "INSERT INTO boards (title) VALUES ($1) RETURNING *",
      [body.title],
    );

    const board = result.rows[0];

    await pool.query(
      "INSERT INTO board_members (board_id, user_id) VALUES ($1, $2)",
      [board.id, userID],
    );

    return res.status(201).json(board);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create board" });
  }
});

///////// BOARDS I'M IN
app.get("/boards", async (req, res) => {
  try {
    const userID: number = res.locals.userID;

    const result = await pool.query(
      `SELECT boards.id, boards.title
       FROM boards
       JOIN board_members ON boards.id = board_members.board_id
       WHERE board_members.user_id = $1`,
      [userID],
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to get boards" });
  }
});

////////// ONE BOARD WITH ITS TASKS AND MEMBERS
app.get("/boards/:id", async (req, res) => {
  try {
    const userID: number = res.locals.userID;
    const boardID = Number(req.params.id);
    // const member = await pool.query(
    //   "SELECT * FROM board_members WHERE board_id = $1 AND user_id = $2",
    //   [boardID, userID],
    // );

    // if (member.rows.length === 0) {
    //   return res.status(403).json({
    //     error: "You are not a member of this board",
    //   });
    // }

    const board = await pool.query("SELECT * FROM boards WHERE id = $1", [
      boardID,
    ]);

    if (board.rows.length === 0) {
      return res.status(404).json({ error: "Board not found" });
    }

    const tasks = await pool.query("SELECT * FROM tasks WHERE board_id = $1", [
      boardID,
    ]);

    const members = await pool.query(
      `SELECT users.id, users.name, users.email
       FROM users
       JOIN board_members ON users.id = board_members.user_id
       WHERE board_members.board_id = $1`,
      [boardID],
    );

    return res.status(200).json({
      board: board.rows[0],
      tasks: tasks.rows,
      members: members.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to get board" });
  }
});

////////// INVITE MEMBER
app.post("/boards/:id/members", async (req, res) => {
  try {
    const userID: number = res.locals.userID;
    const boardID = Number(req.params.id);
    const body = req.body;
    if (!body.email) {
      return res.status(400).json({ error: "Email is required" });
    }

    let result = await pool.query(
      "SELECT id, name, email FROM users WHERE email = $1",
      [body.email],
    );

    if (result.rows.length === 0) {
      result = await pool.query(
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
        [body.email, body.email],
      );
    }
    const user = result.rows[0];
    const existingMember = await pool.query(
      "SELECT * FROM board_members WHERE board_id = $1 AND user_id = $2",
      [boardID, user.id],
    );
    if (existingMember.rows.length > 0) {
      return res.status(400).json({
        error: "User is already a member",
      });
    }
    // const member = await pool.query(
    //   "SELECT * FROM board_members WHERE board_id = $1 AND user_id = $2",
    //   [boardID, userID],
    // );

    // if (member.rows.length === 0) {
    //   return res.status(403).json({
    //     error: "You are not a member of this board",
    //   });
    // }
    ///invite zhasalyp zhatkan kosylady koroche
    await pool.query(
      "INSERT INTO board_members (board_id, user_id) VALUES ($1, $2)",
      [boardID, user.id],
    );

    return res.status(201).json({
      member: user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to invite member" });
  }
});

////////// CREATE TASK
app.post("/boards/:id/tasks", async (req, res) => {
  try {
    const userID: number = res.locals.userID;
    const boardID = Number(req.params.id);
    const body = req.body;
    if (!body.title) {
      return res.status(400).json({ error: "Title is required" });
    }
    // const member = await pool.query(
    //   "SELECT * FROM board_members WHERE board_id = $1 AND user_id = $2",
    //   [boardID, userID],
    // );
    // if (member.rows.length === 0) {
    //   return res.status(403).json({
    //     error: "You are not a member of this board",
    //   });
    // }
    const result = await pool.query(
      `INSERT INTO tasks (title, description, status, assigned_to, board_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        body.title,
        body.description || null,
        body.status || "todo",
        body.assigned_to || null,
        boardID,
      ],
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create task" });
  }
});

//////////////////
app.listen(3000, () => {
  console.log("Server running on port 3000");
});
