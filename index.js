const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, Counter, User, Person } = require("./db");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

// 从云托管请求头获取 openid（小程序 callContainer 时自动注入）
function getOpenId(req) {
  return req.headers["x-wx-openid"] || req.headers["X-WX-OPENID"] || "";
}

// 需要登录的接口：无 openid 时返回 401
function requireOpenId(req, res, next) {
  const openid = getOpenId(req);
  if (!openid) {
    return res.status(401).json({ code: 401, message: "未登录或 openid 缺失" });
  }
  req.openid = openid;
  next();
}

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 更新计数（保留原模板）
app.post("/api/count", async (req, res) => {
  const { action } = req.body;
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({ truncate: true });
  }
  res.send({
    code: 0,
    data: await Counter.count(),
  });
});

app.get("/api/count", async (req, res) => {
  const result = await Counter.count();
  res.send({ code: 0, data: result });
});

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

// ========== 用户与关系人 API ==========

// 用户登录/注册：确保用户记录存在
app.post("/api/user/login", requireOpenId, async (req, res) => {
  try {
    const [user] = await User.findOrCreate({
      where: { openid: req.openid },
      defaults: { openid: req.openid },
    });
    res.json({ code: 0, data: { openid: user.openid } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 获取当前用户的所有关系人
app.get("/api/persons", requireOpenId, async (req, res) => {
  try {
    const rows = await Person.findAll({
      where: { openid: req.openid },
      order: [["createdAt", "ASC"]],
    });
    const data = rows.map((r) => r.toJSON());
    res.json({ code: 0, data });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 新增关系人
app.post("/api/persons", requireOpenId, async (req, res) => {
  try {
    const { id, path: pathArr, pathLabel, name, rank, status, maritalStatus, photoPath, traits, contact } = req.body;
    if (!id || !name || !Array.isArray(pathArr)) {
      return res.status(400).json({ code: 400, message: "缺少 id、name 或 path" });
    }
    const [person, created] = await Person.findOrCreate({
      where: { openid: req.openid, id },
      defaults: {
        openid: req.openid,
        id,
        path: pathArr,
        pathLabel: pathLabel || pathArr.join("的"),
        name,
        rank: rank ?? 1,
        status: status || "living",
        maritalStatus: maritalStatus || "",
        photoPath: photoPath || "",
        traits: traits || "",
        contact: contact || "",
      },
    });
    if (!created) {
      return res.status(409).json({ code: 409, message: "该 id 已存在" });
    }
    res.json({ code: 0, data: person.toJSON() });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 更新关系人
app.put("/api/persons/:id", requireOpenId, async (req, res) => {
  try {
    const { id } = req.params;
    const { path: pathArr, pathLabel, name, rank, status, maritalStatus, photoPath, traits, contact } = req.body;
    const person = await Person.findOne({
      where: { openid: req.openid, id },
    });
    if (!person) {
      return res.status(404).json({ code: 404, message: "未找到该关系人" });
    }
    const updates = {};
    if (Array.isArray(pathArr)) updates.path = pathArr;
    if (pathLabel !== undefined) updates.pathLabel = pathLabel;
    if (name !== undefined) updates.name = name;
    if (rank !== undefined) updates.rank = rank;
    if (status !== undefined) updates.status = status;
    if (maritalStatus !== undefined) updates.maritalStatus = maritalStatus;
    if (photoPath !== undefined) updates.photoPath = photoPath;
    if (traits !== undefined) updates.traits = traits;
    if (contact !== undefined) updates.contact = contact;
    await person.update(updates);
    res.json({ code: 0, data: (await person.reload()).toJSON() });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 删除关系人
app.delete("/api/persons/:id", requireOpenId, async (req, res) => {
  try {
    const { id } = req.params;
    const person = await Person.findOne({
      where: { openid: req.openid, id },
    });
    if (!person) {
      return res.status(404).json({ code: 404, message: "未找到该关系人" });
    }
    await person.destroy();
    res.json({ code: 0, message: "已删除" });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 获取单个关系人
app.get("/api/persons/:id", requireOpenId, async (req, res) => {
  try {
    const { id } = req.params;
    const person = await Person.findOne({
      where: { openid: req.openid, id },
    });
    if (!person) {
      return res.status(404).json({ code: 404, message: "未找到该关系人" });
    }
    res.json({ code: 0, data: person.toJSON() });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 全量同步：用客户端 graph.persons 覆盖服务端（用于首次登录或恢复）
app.post("/api/persons/sync", requireOpenId, async (req, res) => {
  try {
    const { persons } = req.body;
    if (!Array.isArray(persons)) {
      return res.status(400).json({ code: 400, message: "需要 persons 数组" });
    }
    const openid = req.openid;
    await Person.destroy({ where: { openid } });
    const created = [];
    for (const p of persons) {
      const row = await Person.create({
        openid,
        id: p.id,
        path: p.path || [],
        pathLabel: p.pathLabel || (p.path || []).join("的"),
        name: p.name,
        rank: p.rank ?? 1,
        status: p.status || "living",
        maritalStatus: p.maritalStatus || "",
        photoPath: p.photoPath || "",
        traits: p.traits || "",
        contact: p.contact || "",
      });
      created.push(row.toJSON());
    }
    res.json({ code: 0, data: created });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
