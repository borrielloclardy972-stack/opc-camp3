const MATERIALS_KEY = "materials";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "86400"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function getBearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function accessMode(request, env) {
  const token = getBearer(request);
  if (token && token === env.EDIT_CODE) return "edit";
  if (token && token === env.VIEW_CODE) return "view";
  return "";
}

function requireAccess(request, env) {
  const mode = accessMode(request, env);
  if (!mode) return { error: json({ error: "未授权" }, 401) };
  return { mode };
}

function requireEdit(request, env) {
  const mode = accessMode(request, env);
  if (mode !== "edit") return { error: json({ error: "需要编辑卡密" }, 403) };
  return { mode };
}

async function readMaterials(env) {
  const value = await env.MATERIALS_KV.get(MATERIALS_KEY);
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

async function writeMaterials(env, materials) {
  await env.MATERIALS_KV.put(MATERIALS_KEY, JSON.stringify(materials.slice(0, 1000)));
}

function safeFileName(name) {
  return String(name || "material")
    .replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-")
    .slice(0, 120);
}

async function uploadFileIfPossible(request, env, form, payload) {
  const file = form.get("file");
  if (!file || typeof file === "string" || !env.MATERIALS_BUCKET) return payload;

  const key = `materials/${Date.now()}-${safeFileName(file.name)}`;
  await env.MATERIALS_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream"
    }
  });

  const url = new URL(request.url);
  payload.fileName = file.name || "";
  payload.fileType = file.type || "";
  payload.fileUrl = `${url.origin}/api/files/${encodeURIComponent(key)}`;
  if ((file.type || "").startsWith("image/")) {
    payload.cover = payload.fileUrl;
  }
  return payload;
}

async function handleSession(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  if (code && code === env.EDIT_CODE) return json({ mode: "edit" });
  if (code && code === env.VIEW_CODE) return json({ mode: "view" });
  return json({ error: "卡密不正确" }, 401);
}

async function handleGetMaterials(request, env) {
  const access = requireAccess(request, env);
  if (access.error) return access.error;
  return json({ materials: await readMaterials(env) });
}

async function handleCreateMaterial(request, env) {
  const access = requireEdit(request, env);
  if (access.error) return access.error;

  const contentType = request.headers.get("Content-Type") || "";
  let payload;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    payload = JSON.parse(String(form.get("payload") || "{}"));
    payload = await uploadFileIfPossible(request, env, form, payload);
  } else {
    payload = await request.json();
  }

  if (!payload || !payload.name || !payload.platform) {
    return json({ error: "素材信息不完整" }, 400);
  }

  const item = [
    payload.id || `UP-${Date.now().toString().slice(-6)}`,
    payload.name,
    payload.platform,
    payload.category || "未分类",
    payload.audience || "AI创业粉",
    payload.type || "图文",
    payload.source || "上传",
    payload.duration || "File",
    payload.title || payload.note || payload.fileName || "新上传素材",
    payload.colors || "#1b2635, #7a5cff",
    payload.cover || "",
    payload.fileUrl || "",
    payload.fileName || "",
    new Date().toISOString()
  ];

  const materials = await readMaterials(env);
  materials.unshift(item);
  await writeMaterials(env, materials);
  return json({ material: item });
}

async function handleFile(request, env, path) {
  if (!env.MATERIALS_BUCKET) return json({ error: "未配置文件存储" }, 404);
  const key = decodeURIComponent(path.replace("/api/files/", ""));
  const object = await env.MATERIALS_BUCKET.get(key);
  if (!object) return json({ error: "文件不存在" }, 404);
  return new Response(object.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000"
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") return json({ ok: true });
      if (path === "/api/session" && request.method === "POST") return handleSession(request, env);
      if (path === "/api/materials" && request.method === "GET") return handleGetMaterials(request, env);
      if (path === "/api/materials" && request.method === "POST") return handleCreateMaterial(request, env);
      if (path.startsWith("/api/files/") && request.method === "GET") return handleFile(request, env, path);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: error.message || "Server error" }, 500);
    }
  }
};
