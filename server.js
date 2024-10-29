const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const db = require("./db");

// 환경변수 로드
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

// CORS 설정
app.use(
  cors({
    origin: "http://localhost:3000", // 허용할 도메인
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // 허용할 HTTP 메소드
    allowedHeaders: ["Authorization", "Content-Type"], // 허용할 헤더
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
      `SELECT post.idx, member.nickname, title, content, time, reply_count AS replyCount 
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
  if (!writer) {
    return;
  }
  writer = writer.toString().replace("<", "").replace(">", "").trim();
  title = title.replace("<", "﹤").replace(">", "﹥").trim();

  const isValidWriter =
    typeof writer === "string" && 0 < writer.length && writer.length <= 50;
  const isValidTitle =
    typeof title === "string" && 0 < title.length && title.length <= 50;
  const isValidContent =
    typeof content === "string" && 0 < content.length && content.length <= 1000;
  return isValidWriter && isValidTitle && isValidContent;
}

// ---------------------------------------------------------
// 카카오 로그인

const kakaoRedirectUrl = `http://localhost:8080/auth/kakao/callback`;
const KAKAO_CLIENT_KEY = process.env.KAKAO_CLIENT_KEY;
// const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

app.get("/auth/kakao", (req, res) => {
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${KAKAO_CLIENT_KEY}&redirect_uri=${kakaoRedirectUrl}`;
  res.redirect(kakaoAuthUrl);
});

app.get("/auth/kakao/callback", async (req, res) => {
  const { code } = req.query;

  console.log(code);

  try {
    // 토큰 요청
    const kakaoTokenReponse = await axios.post(
      "https://kauth.kakao.com/oauth/token",
      null,
      {
        params: {
          grant_type: "authorization_code",
          client_id: KAKAO_CLIENT_KEY,
          redirect_uri: kakaoRedirectUrl,
          code: code,
        },
      }
    );

    const kakaoAccessToken = kakaoTokenReponse.data.access_token;

    // --------------------kakao 정보 가져오기 -----------
    //   // 사용자 정보 요청
    const userInfoResponse = await axios.get(
      "https://kapi.kakao.com/v2/user/me",
      {
        headers: {
          Authorization: `Bearer ${kakaoAccessToken}`,
        },
      }
    );

    const userInfo = userInfoResponse.data;

    const query = "SELECT id FROM member WHERE id = ?";
    const [result] = await db.query(query, [userInfo.id]);

    console.log(result[0]);
    if (!result[0] || result[0].length === 0) {
      console.log("등록되지 않은 아이디입니다.");

      console.log(userInfo);
      const params = {
        id: userInfo.id,
        nickname: userInfo.properties.nickname,
        pwd: null,
        social: "KAKAO",
      };

      axios
        .post("http://localhost:8080/api/register", params)
        .then((response) => {
          console.log("카카오 가입이 완료되었습니다.");
        })
        .catch((error) => {
          console.log("카카오 가입이 실패하였습니다.");
          console.error(error);
        });
    }

    const id = userInfo.id;
    // const nickname = userInfo.properties.nickname;
    // const profile_image = userInfo.properties.profile_image;

    // --------------------------------------------

    // 사용자 정보를 토대로 자체 JWT 발급
    const accessToken = jwt.sign(
      {
        id: id,
        accessToken: kakaoAccessToken,
        // nickname: nickname,
        // profile_image: profile_image,
        loginMethod: "KAKAO", // 로그인 방식 명시
      },
      JWT_SECRET_KEY,
      { expiresIn: "1h" }
    );

    // 토큰 쿠키에 저장
    res.cookie("accessToken", accessToken, {
      httpOnly: false, // 개발 환경에서는 끔
      secure: false, // https 여부
      maxAge: 360000, // ms
    });

    // 클라이언트로 리다이렉트
    res.redirect("http://localhost:3000");
  } catch (error) {
    console.error(error);
    console.error("로그인에 실패했습니다.");
    res.redirect("http://localhost:3000/login");
  }
});

app.post("/api/login", async (req, res) => {
  const { id, pwd } = req.body;

  try {
    const query =
      "SELECT id, nickname, profile_image FROM member WHERE id = ? AND pwd = ?";
    const [result] = await db.query(query, [id, pwd]);

    console.log(result[0]);

    if (!result[0] || result[0].length === 0) {
      return res
        .status(404)
        .json({ message: "아이디나 비밀번호가 일치하지 않습니다." });
    }

    // 토큰 생성
    const accessToken = jwt.sign(
      {
        id: result[0].id,
        nickname: result[0].nickname,
        profile_image: result[0].profile_image,
      },
      JWT_SECRET_KEY,
      { expiresIn: "1h" }
    );

    // 토큰을 클라이언트로 응답
    return res.status(200).json({ accessToken });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error });
  }
});

app.get("/api/member", async (req, res) => {
  console.log(req.headers.authorization);
  const accessToken = req.headers.authorization.split(" ")[1]; // 'Bearer ' 제거

  try {
    jwt.verify(accessToken, JWT_SECRET_KEY, (err, decoded) => {
      if (err) {
        console.error(err);
        res.status(404).json({ message: "" });
        return;
      }

      // decoded 객체에서 정보 추출
      console.log("Decoded JWT:", decoded); // Payload 정보

      const id = decoded.id;
      // const nickname = decoded.nickname;

      res.status(200).json({ id });
    });
  } catch (error) {
    console.error(error);
    res.status(404).json({ message: "유효하지 않은 토큰입니다." });
  }
});

app.get("/api/memberInfo", async (req, res) => {
  const { id } = req.query;

  console.error("/api/memberInfo");
  console.log(id);
  try {
    const query = "SELECT nickname, profile_image FROM member WHERE id = ?";
    const [response] = await db.query(query, [id]);
    console.log(response[0]);

    res.status(200).json({
      nickname: response[0].nickname,
      profile_image: response[0].profile_image,
    });
  } catch (error) {
    console.error(error);
  }
});

// 댓글
app.get("/api/reply/:postIdx", async (req, res) => {
  const postIdx = req.params.postIdx;

  console.log(postIdx);
  try {
    const query =
      "SELECT content, nickname, time FROM reply r JOIN member m ON r.member_id = m.id WHERE post_idx = ? ORDER BY time";
    const [replys] = await db.query(query, [postIdx]);

    // console.log(response[0]);
    res.status(200).json({ replys: replys });
  } catch (error) {
    console.error(error);
  }
});

app.post("/api/reply", async (req, res) => {
  console.log(req.body);
  const { post_idx, content, member_id } = req.body;

  console.log(
    `post_idx: ${post_idx}, content: ${content}, member_id: ${member_id}`
  );

  try {
    const queryToReply =
      "INSERT INTO reply (post_idx, content, member_id) VALUES ( ?, ?, ? )";

    const [response] = await db.query(queryToReply, [
      post_idx,
      content,
      member_id,
    ]);

    const queryToPost =
      "UPDATE post SET reply_count = reply_count + 1 WHERE idx = ?";

    await db.query(queryToPost, [post_idx]);

    res.status(200).json({ message: "성공!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error!" });
  }
});

/** 카카오 유저 정보 가져오기 */
// app.get("/api/member/kakao", async (req, res) => {
//   try {
//     const accessToken = req.headers.authorization.split(" ")[1]; // 'Bearer ' 제거
//     console.log(accessToken);

//     //   // 사용자 정보 요청
//     const userInfoResponse = await axios.get(
//       "https://kapi.kakao.com/v2/user/me",
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//       }
//     );

//     const userInfo = userInfoResponse.data;
//     console.log(userInfoResponse.data.id);

//     const query = "SELECT * FROM member WHERE id = ?";
//     const result = await db.query(query, [userInfoResponse.data.id]);

//     console.log(result[0]);
//     if (!result[0] || result[0].length === 0) {
//       console.log("등록되지 않은 아이디입니다.");

//       const params = {
//         id: userInfoResponse.data.id,
//         social: "KAKAO",
//         nickname: "NONE",
//       };

//       axios
//         .post("http://localhost:8080/api/register", params)
//         .then((response) => {})
//         .catch((error) => {
//           console.error(error);
//         });
//     }

//     // const id = userInfo.id;
//     const nickname = userInfo.properties.nickname;
//     const profile_image = userInfo.properties.profile_image;
//     res.status(200).json({ nickname, profile_image });
//   } catch (error) {
//     console.error(error);
//   }
// });

// async function getKaKaoMember(accessToken) {
//   try {
//     console.log(accessToken);

//     //   // 사용자 정보 요청
//     const userInfoResponse = await axios.get(
//       "https://kapi.kakao.com/v2/user/me",
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//       }
//     );

//     const userInfo = userInfoResponse.data;
//     console.log(userInfoResponse.data.id);

//     const query = "SELECT * FROM member WHERE id = ?";
//     const result = await db.query(query, [userInfoResponse.data.id]);

//     console.log(result[0]);
//     if (!result[0] || result[0].length === 0) {
//       console.log("등록되지 않은 아이디입니다.");

//       const params = {
//         id: userInfoResponse.data.id,
//         social: "KAKAO",
//         nickname: "NONE",
//       };

//       axios
//         .post("http://localhost:8080/api/register", params)
//         .then((response) => {})
//         .catch((error) => {
//           console.error(error);
//         });
//     }

//     // const id = userInfo.id;
//     const nickname = userInfo.properties.nickname;
//     const profile_image = userInfo.properties.profile_image;
//     return { nickname, profile_image };
//   } catch (error) {
//     console.error(error);
//   }
// }

app.post("/api/register", async (req, res) => {
  const { id, pwd, nickname, social } = req.body;

  try {
    const query = "SELECT * FROM member WHERE ID = ?";

    const [member] = await db.query(query, [id]);

    if (!member[0] || member[0].length === 0) {
      const query =
        "INSERT INTO member (id, pwd, nickname, profile_image, social) VALUES (?, ?, ?, ?, ?)";
      const result = await db.query(query, [id, pwd, nickname, null, social]);

      return res
        .status(200)
        .json({ message: "회원가입에 성공했습니다.", idx: result[0].insertId });
    }
  } catch (error) {
    console.error(error);
  }

  return res.status(500).json({ message: "Server Error!" });
});

// 서버 실행
app.listen(port, () => {
  console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});
