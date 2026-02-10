const { Sequelize, DataTypes } = require("sequelize");

// 从环境变量读取数据库配置（云托管控制台配置 MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS）
const { MYSQL_USERNAME = "root", MYSQL_PASSWORD = "", MYSQL_ADDRESS = "127.0.0.1:3306" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host: host || "127.0.0.1",
  port: port || 3306,
  dialect: "mysql",
});

// 计数演示（保留原模板）
const Counter = sequelize.define("Counter", {
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
});

// 用户表（登录后自动创建记录）
const User = sequelize.define("User", {
  openid: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
});

// 关系人表（用户维护的亲戚）
const Person = sequelize.define("Person", {
  openid: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: "所属用户 openid",
  },
  id: {
    type: DataTypes.STRING(64),
    allowNull: false,
    primaryKey: true,
    comment: "person 唯一 id，如 mom_bro_1",
  },
  path: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    comment: "关系路径，如 [\"妈妈\", \"哥哥\"]",
  },
  pathLabel: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: "路径显示，如 妈妈的哥哥",
  },
  name: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: "称呼，如 舅舅",
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: "同路径多人时的排行",
  },
  status: {
    type: DataTypes.STRING(32),
    allowNull: true,
    defaultValue: "living",
    comment: "在世 living / 离世 deceased",
  },
  maritalStatus: {
    type: DataTypes.STRING(32),
    allowNull: true,
    defaultValue: "",
    comment: "婚姻状态 married/unmarried/divorced/widowed",
  },
  photoPath: {
    type: DataTypes.STRING(512),
    allowNull: true,
    defaultValue: "",
    comment: "照片路径（本地或云存储）",
  },
  traits: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "人物特征",
  },
  contact: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: "联系方式",
  },
}, {
  timestamps: true,
  createdAt: "createdAt",
  updatedAt: "updatedAt",
});

User.hasMany(Person, { foreignKey: "openid" });
Person.belongsTo(User, { foreignKey: "openid" });

async function init() {
  await Counter.sync({ alter: true });
  await User.sync({ alter: true });
  await Person.sync({ alter: true });
}

module.exports = {
  init,
  sequelize,
  Counter,
  User,
  Person,
};
