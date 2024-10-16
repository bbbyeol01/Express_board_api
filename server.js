const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const db = require("./db");

// 환경변수 로드
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// CORS 설정
app.use(
  cors({
    origin: "http://localhost:3000", // 허용할 도메인
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // 허용할 HTTP 메소드
    credentials: true, // 쿠키 전송 허용
  })
);

// JSON 요청을 처리하기 위한 미들웨어
app.use(express.json());

// 기본 API 엔드포인트
app.get("/", (req, res) => {
  res.send("백엔드 서버가 정상적으로 실행 중입니다!");
});

// DB 연결 확인
app.get("/api/db-check", async (req, res) => {
  try {
    // 간단한 쿼리를 실행해서 DB 연결 확인
    const [rows] = await db.query("SELECT 1");
    res.status(200).send("DB Connected!");
  } catch (error) {
    console.error("DB Connection Error:", error);
    res.status(500).send("DB Connection Failed");
  }
});

app.get("/api/board", async (req, res) => {
  const { page } = req.query;

  if (!page) {
    page = 1;
  }

  console.log(page);

  try {
    const [totalCount] = await db.query(
      `SELECT COUNT(*) AS total 
      FROM post`
    );

    const [posts] = await db.query(
      `SELECT post.idx, member.nickname, title, content, time 
      FROM post JOIN member 
      ON post.writer = member.id 
      ORDER BY post.idx DESC
      LIMIT ${(page - 1) * 10}, 10`
    );

    console.log(posts);

    return res.status(200).json({ posts, totalCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
});

app.get("/api/board/:idx", async (req, res) => {
  const idx = req.params.idx;
  try {
    const [post] = await db.query(
      "SELECT post.idx, member.nickname, title, content, time FROM post JOIN member WHERE post.writer = member.id AND post.idx = ?",
      [idx]
    );

    if (post) {
      res.json(post);
    } else {
      res.status(404).json({ message: "Post Not found" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
});

app.post("/api/board", async (req, res) => {
  const { writer, title, content } = req.body;

  console.log({ writer, title, content });

  if (!validInput(writer, title, content)) {
    return res.status(400).json({ message: "유효하지 않은 입력입니다." });
  }

  // 데이터 유효성 검사
  if (!writer || !title || !content) {
    return res.status(400).json({ message: "모든 필드를 입력해야 합니다." });
  }

  try {
    const query = "INSERT INTO post (writer, title, content) VALUES (?, ?, ?)";
    const result = await db.query(query, [writer, title, content]);
    return res
      .status(200)
      .json({ message: "정상적으로 등록되었습니다.", idx: result[0].insertId });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
});

function validInput(writer, title, content) {
  writer = writer.replace("<", "").replace(">", "").trim();
  title = title.replace("<", "﹤").replace(">", "﹥").trim();

  const isValidWriter =
    typeof writer === "string" && 0 < writer.length && writer.length <= 50;
  const isValidTitle =
    typeof title === "string" && 0 < title.length && title.length <= 50;
  const isValidContent =
    typeof content === "string" && 0 < content.length && content.length <= 1000;
  return isValidWriter && isValidTitle && isValidContent;
}

// 서버 실행
app.listen(port, () => {
  console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});
