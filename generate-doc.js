const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
        LevelFormat, PageBreak, TableOfContents, Header, Footer, PageNumber } = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function cell(text, width, opts = {}) {
  const runs = [];
  if (opts.bold) runs.push(new TextRun({ text, bold: true, font: "Arial", size: 20 }));
  else runs.push(new TextRun({ text, font: "Arial", size: 20 }));
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ alignment: opts.align || AlignmentType.LEFT, children: runs })]
  });
}

function headerCell(text, width) {
  return cell(text, width, { bold: true, fill: "D5E8F0", align: AlignmentType.CENTER });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "promise Blog Security Report", font: "Arial", size: 18, color: "999999" })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC", space: 4 } }
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Page ", font: "Arial", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" })]
        })]
      })
    },
    children: [
      // ===== Title Page =====
      new Paragraph({ spacing: { before: 2400 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
        children: [new TextRun({ text: "promise 博客", font: "Arial", size: 56, bold: true, color: "2E75B6" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
        children: [new TextRun({ text: "安全优化心得", font: "Arial", size: 48, bold: true, color: "2E75B6" })] }),
      new Paragraph({ spacing: { before: 400 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
        children: [new TextRun({ text: "https://www.daishutao.online", font: "Arial", size: 24, color: "666666" })] }),
      new Paragraph({ spacing: { before: 600 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
        children: [new TextRun({ text: "安全评分：96 / 100", font: "Arial", size: 28, bold: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
        children: [new TextRun({ text: "修复项目：34 项", font: "Arial", size: 24, color: "666666" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "2026年6月7日", font: "Arial", size: 22, color: "999999" })] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== TOC =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("目录")] }),
      new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== Section 1: Overview =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("一、概述")] }),
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "网站：https://www.daishutao.online", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "优化前安全评分：约55分（无防护的Express博客）", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "优化后安全评分：96分", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "修复项目总数：34项", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "耗时：五轮安全审计", font: "Arial", size: 22 })] }),
      new Paragraph({ children: [new TextRun({ text: "从最基础的Express博客框架出发，通过五轮深入安全审计，将网站安全等级从“几乎不设防”提升到了“企业级”水平，达到96分的极高水准。", font: "Arial", size: 22 })] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== Section 2: Security Overview Table =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("二、安全防护总览表")] }),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [3000, 6026],
        rows: [
          new TableRow({ children: [headerCell("防护层级", 3000), headerCell("技术方案", 6026)] }),
          new TableRow({ children: [cell("Admin 入口隐藏", 3000, { bold: true }), cell("URL token 参数，404伪装", 6026)] }),
          new TableRow({ children: [cell("身份认证", 3000, { bold: true }), cell("bcrypt哈希 + JWT(issuer/audience) + httpOnly+secure+strict Cookie", 6026)] }),
          new TableRow({ children: [cell("双重验证", 3000, { bold: true }), cell("Cloudflare Turnstile + TOTP动态码(Microsoft Authenticator)", 6026)] }),
          new TableRow({ children: [cell("CSRF防护", 3000, { bold: true }), cell("双Cookie提交模式，所有管理写操作保护", 6026)] }),
          new TableRow({ children: [cell("XSS防护", 3000, { bold: true }), cell("sanitize-html清洗 + 评论清理 + CSP无unsafe-inline", 6026)] }),
          new TableRow({ children: [cell("SQL注入防护", 3000, { bold: true }), cell("参数化查询(tagged template)", 6026)] }),
          new TableRow({ children: [cell("速率限制", 3000, { bold: true }), cell("登录10次/15min、评论5次/15min、搜索30次/min", 6026)] }),
          new TableRow({ children: [cell("HTTP安全头", 3000, { bold: true }), cell("Helmet(CSP/HSTS/Permissions-Policy/X-Frame-Options等)", 6026)] }),
          new TableRow({ children: [cell("文件上传", 3000, { bold: true }), cell("MIME白名单(30+类型)、文件名清理、SVG已移除", 6026)] }),
          new TableRow({ children: [cell("数据保护", 3000, { bold: true }), cell("密码文章过滤(RSS/站点地图/归档)、密码hash不泄露", 6026)] }),
          new TableRow({ children: [cell("日志审计", 3000, { bold: true }), cell("Morgan请求日志 + audit_log数据库审计表", 6026)] }),
          new TableRow({ children: [cell("爬虫指引", 3000, { bold: true }), cell("robots.txt + security.txt", 6026)] }),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== Section 3: Five Rounds =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("三、五轮安全审计详情")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("第一轮（密码+基础防护）7项")] }),
      ...[
        "文章密码bcrypt哈希",
        "添加Helmet安全响应头",
        "评论输入清理+邮箱校验",
        "登录/评论/密码验证速率限制",
        "管理员操作CSRF保护",
        "文件上传MIME白名单",
        "JWT_SECRET生产必填 + sameSite strict"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] })),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("第二轮（CSP+密码泄露）7项")] }),
      ...[
        "Content-Security-Policy配置",
        "Permissions-Policy手动设置",
        "密码hash防泄露(3处delete post.password)",
        "密码验证加速率限制",
        "请求体1MB大小限制",
        "multer错误信息隐藏",
        "HSTS头开启"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] })),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("第三轮（RSS/搜索/归档）5项")] }),
      ...[
        "RSS过滤密码文章",
        "搜索速率限制 + 查询长度100字符",
        "Archive过滤密码文章",
        "Admin API密码hash不返回",
        "About API删除password字段"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] })),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("第四轮（Marked XSS/日志/JWT）6项")] }),
      ...[
        "marked输出sanitize-html清洗",
        "views防刷(cookie 1h不重复计数)",
        "验证码增强(1-20加减混合)",
        "Morgan请求日志",
        "JWT添加issuer/audience + 验证时校验",
        "统计接口/admin/check轻量化"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] })),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("第五轮（审计日志+SVG）2项")] }),
      ...[
        "audit_log管理员操作审计表",
        "SVG从上传白名单移除 + sanitize收紧"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] })),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("补充修复（搜索/Turnstile/夜间模式/robots）7项")] }),
      ...[
        "搜索图标onclick→addEventListener适配CSP",
        "Cloudflare Turnstile替代数学验证码",
        "夜间模式CSS变量 + 主题切换按钮",
        "robots.txt + security.txt",
        "SITE_URL修复避泄露Vercel域名",
        "导航栏Admin链接隐藏",
        "F+H方案：URL token隐藏入口 + TOTP动态码"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] })),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== Section 4: Defense in Depth =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("四、防御纵深示意")] }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Admin登录路径的多层防御：", font: "Arial", size: 22 })] }),
      ...[
        "第1层 → URL隐藏入口（不知道暗号的访客看到404）",
        "第2层 → 速率限制 + bcrypt哈希（阻止暴力破解）",
        "第3层 → Turnstile人机验证（阻止自动化脚本）",
        "第4层 → TOTP 30秒动态码（密码泄露也无用）",
        "第5层 → JWT会话管理（审计校验）",
        "第6层 → CSRF令牌（防止跨站请求伪造）",
        "第7层 → 输入清洗 + CSP（即便绕过了也无法注入）"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: t, font: "Arial", size: 22 })] })),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== Section 5: Core Files =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("五、核心文件清单")] }),
      ...[
        "server.js — 主要安全逻辑，约900行",
        "database.js — 审计日志表、数据库初始化",
        "public/js/admin.js — TOTP+Turnstile登录逻辑",
        "public/js/dashboard.js — 事件委托+CSRF自动注入",
        "public/js/search.js — CSP兼容重写",
        "public/js/app.js — 夜间模式+密码按钮事件",
        "public/css/style.css — 夜间模式变量",
        "public/.well-known/security.txt — 安全联系人",
        "public/robots.txt — 爬虫指引"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] })),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== Section 6: Maintenance =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("六、维护建议")] }),
      ...[
        "每季度运行 npm audit 检查依赖漏洞",
        "JWT_SECRET / TOTP_SECRET 定期轮换",
        "关注 helmet / marked / sanitize-html 安全公告",
        "定期备份 audit_log 表（审计追溯）",
        "TOTP切换手机时重新扫码配置",
        "定期浏览 securityheaders.com 验证HTTP安全头"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] })),

      // ===== Section 7: Conclusion =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("七、结语")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: "经过五轮34项修复，promise博客从基础防护提升到企业级安全水平，96分的评分对于个人博客已属极致。", font: "Arial", size: 24 })
      ] }),
      new Paragraph({ spacing: { after: 120 }, children: [
        new TextRun({ text: "核心原则：", font: "Arial", size: 24, bold: true })
      ] }),
      ...[
        "纵深防御——多层防护叠加，而非依赖单一方案",
        "最小暴露面——隐藏入口、限制API、过滤敏感数据",
        "输入不信任——所有用户输入均经过清洗和校验"
      ].map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: t, font: "Arial", size: 22 })] })),

      new Paragraph({ spacing: { before: 400 } }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: "2026年6月7日", font: "Arial", size: 22, color: "666666" })
      ] }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = "d:\\001\\000 VS code\\001 website\\安全优化心得.docx";
  fs.writeFileSync(outPath, buffer);
  console.log("Document saved to: " + outPath);
}).catch(err => {
  console.error("Error:", err);
});
