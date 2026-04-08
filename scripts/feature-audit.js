#!/usr/bin/env node

/*
  Automated CiviQ feature audit.
  Validates: signup, login, profile, complaint create (json + image), complaint list.
*/

const API_BASE = process.env.AUDIT_API_BASE || "http://localhost:5000";

function uniqueEmail(prefix = "audit") {
  return `${prefix}${Date.now()}@test.com`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text || "Invalid response" };
  }
  return { response, payload };
}

function assertOrThrow(condition, message) {
  if (!condition) throw new Error(message);
}

async function runAudit() {
  const result = {
    apiBase: API_BASE,
    checks: [],
    success: false,
  };

  const userEmail = uniqueEmail("useraudit");
  const adminEmail = uniqueEmail("adminaudit");
  const password = "Test@12345";

  const check = (name, ok, details = "") => {
    result.checks.push({ name, ok, details });
  };

  // Resident signup/login/profile
  const signup = await request("/api/users/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Audit Resident",
      email: userEmail,
      password,
      role: "user",
    }),
  });
  check(
    "resident-signup",
    signup.response.ok && signup.payload?.success,
    signup.payload?.message || "",
  );
  assertOrThrow(
    signup.response.ok && signup.payload?.success,
    "Resident signup failed",
  );

  const login = await request("/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: userEmail, password }),
  });
  const token = login.payload?.data?.token;
  check(
    "resident-login",
    login.response.ok && !!token,
    login.payload?.message || "",
  );
  assertOrThrow(login.response.ok && token, "Resident login failed");

  const authHeaders = { Authorization: `Bearer ${token}` };
  const profile = await request("/api/users/profile", { headers: authHeaders });
  check(
    "resident-profile",
    profile.response.ok && profile.payload?.success,
    profile.payload?.message || "",
  );
  assertOrThrow(
    profile.response.ok && profile.payload?.success,
    "Resident profile fetch failed",
  );

  // Complaint create without image
  const createPlain = await request("/api/complaints", {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Automated audit issue without image",
      location: "Tower A",
      category: "Utilities",
      autoAssign: true,
    }),
  });
  check(
    "issue-create-no-image",
    createPlain.response.status === 201 && createPlain.payload?.success,
    createPlain.payload?.message || "",
  );
  assertOrThrow(
    createPlain.response.status === 201 && createPlain.payload?.success,
    "Issue create without image failed",
  );

  // Complaint create with image
  const pngBytes = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
    0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8,
    153, 99, 248, 15, 4, 0, 9, 251, 3, 253, 167, 189, 167, 0, 0, 0, 0, 73, 69,
    78, 68, 174, 66, 96, 130,
  ]);

  const form = new FormData();
  form.append("description", "Automated audit issue with image");
  form.append("location", "Tower B");
  form.append("category", "Safety");
  form.append("autoAssign", "true");
  form.append(
    "image",
    new Blob([pngBytes], { type: "image/png" }),
    "audit.png",
  );

  const createWithImage = await request("/api/complaints", {
    method: "POST",
    headers: authHeaders,
    body: form,
  });

  const hasImage =
    Array.isArray(createWithImage.payload?.data?.images) &&
    createWithImage.payload.data.images.length > 0;

  check(
    "issue-create-with-image",
    createWithImage.response.status === 201 &&
      createWithImage.payload?.success &&
      hasImage,
    createWithImage.payload?.message || "",
  );
  assertOrThrow(
    createWithImage.response.status === 201 &&
      createWithImage.payload?.success &&
      hasImage,
    "Issue create with image failed",
  );

  // Complaint list for resident
  const list = await request("/api/complaints", { headers: authHeaders });
  const listCount = Array.isArray(list.payload?.data)
    ? list.payload.data.length
    : 0;
  check(
    "resident-complaint-list",
    list.response.ok && list.payload?.success && listCount >= 2,
    `count=${listCount}`,
  );
  assertOrThrow(
    list.response.ok && list.payload?.success && listCount >= 2,
    "Resident complaint list failed",
  );

  // Admin path: signup/login/list/update status
  const adminSignup = await request("/api/users/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Audit Admin",
      email: adminEmail,
      password,
      role: "admin",
    }),
  });
  check(
    "admin-signup",
    adminSignup.response.ok && adminSignup.payload?.success,
    adminSignup.payload?.message || "",
  );
  assertOrThrow(
    adminSignup.response.ok && adminSignup.payload?.success,
    "Admin signup failed",
  );

  const adminLogin = await request("/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password }),
  });
  const adminToken = adminLogin.payload?.data?.token;
  check(
    "admin-login",
    adminLogin.response.ok && !!adminToken,
    adminLogin.payload?.message || "",
  );
  assertOrThrow(adminLogin.response.ok && adminToken, "Admin login failed");

  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };

  const adminList = await request("/api/complaints", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const targetId = adminList.payload?.data?.[0]?._id;
  check(
    "admin-complaint-list",
    adminList.response.ok && adminList.payload?.success && !!targetId,
    `target=${targetId || "none"}`,
  );
  assertOrThrow(
    adminList.response.ok && adminList.payload?.success && !!targetId,
    "Admin complaint listing failed",
  );

  const adminUpdate = await request(`/api/complaints/${targetId}`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({
      status: "Resolved",
      statusMessage: "Resolved by automated audit",
      resolutionDetails: "Audit validation completed",
    }),
  });

  check(
    "admin-status-update",
    adminUpdate.response.ok && adminUpdate.payload?.success,
    adminUpdate.payload?.message || "",
  );
  assertOrThrow(
    adminUpdate.response.ok && adminUpdate.payload?.success,
    "Admin status update failed",
  );

  result.success = result.checks.every((c) => c.ok);
  return result;
}

runAudit()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          error: error.message,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  });
