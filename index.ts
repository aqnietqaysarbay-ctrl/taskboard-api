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

/////////register
app.post("/auth/register", async (req, res) => {
  try {
    const body = req.body;

    if (!body.name || !body.email || !body.password) {
      return res.status(400).json({
        error: "Name, email and password are required",
      });
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [body.name, body.email, hashedPassword],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Registration failed" });
  }
});

//////////login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    let user = result.rows[0];

    const check = await bcrypt.compare(password, user.password);

    if (!check) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is missing");
    }

    const token = jwt.sign({ id: user.id, email: user.email }, secret, {
      expiresIn: "1h",
    });

    return res.status(200).json({
      message: "Login successful",
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

//////////ceate board
app.post("/boards", async (req, res) => {
  try {
    const body = req.body;
    if (!body.title) {
      res.status(400).json({ error: "Title is required" });
    }
    const ownerID = 1;
    const result = await pool.query(
      "INSERT INTO boards (title, owner_id) VALUES ($1, $2) RETURNING *",
      [body.title, ownerID],
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ///////////get tasks
// app.get("/boards/:id/tasks", async (req, res) => {
//   try {
//     const boardID = Number(req.params.id);

//     const result = await pool.query("SELECT * FROM tasks WHERE board_id = $1", [
//       boardID,
//     ]);

//     res.status(200).json(result.rows);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: "Failed to load tasks" });
//   }
// });

//////////////
app.listen(3000, () => {
  console.log("Server running on port 3000");
});
