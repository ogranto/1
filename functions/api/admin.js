export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const body = await request.json();
    const { action, pin, newPin } = body;

    const admin = await verifyAdmin(pin, env);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    if (action === "login") {
        return Response.json({ success: true, name: admin.name, full: admin.full });
    }

    if (action === "changePin") {
        if (!/^\d{4,8}$/.test(String(newPin || ""))) {
            return Response.json({ success: false, error: "PIN must be 4 to 8 digits." }, { status: 400 });
        }
        const admins = await getAdmins(env);
        if (admins.some(a => a.key !== admin.key && a.pin === String(newPin))) {
            return Response.json({ success: false, error: "That PIN is already in use. Choose a different one." }, { status: 400 });
        }
        await env.DB.prepare("INSERT INTO admin_pins (admin_key, pin) VALUES (?, ?) ON CONFLICT(admin_key) DO UPDATE SET pin = excluded.pin")
            .bind(admin.key, String(newPin)).run();
        await logActivity(env, admin.name, "PIN changed", "Changed their own PIN");
        return Response.json({ success: true });
    }

    return new Response("Unknown action", { status: 400 });
}

async function getAdmins(env) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_pins (admin_key TEXT PRIMARY KEY, pin TEXT NOT NULL)").run();
    const { results } = await env.DB.prepare("SELECT admin_key, pin FROM admin_pins").all();
    const saved = {};
    results.forEach(r => { saved[r.admin_key] = r.pin; });
    const admins = [
        { key: 'oscar', name: 'Oscar Grant', full: true, envPin: env.PIN_OSCAR_GRANT },
        { key: 'tilly', name: 'Tilly Britton', full: false, envPin: env.PIN_TILLY_BRITTON },
        { key: 'sam', name: 'Sam Birthwright', full: false, envPin: env.PIN_SAM_BIRTHWRIGHT }
    ];
    return admins.map(a => ({ key: a.key, name: a.name, full: a.full, pin: String(saved[a.key] || a.envPin || '') }));
}

async function verifyAdmin(pin, env) {
    if (!pin) return null;
    const admins = await getAdmins(env);
    const match = admins.find(a => a.pin && a.pin === String(pin));
    return match ? { key: match.key, name: match.name, full: match.full } : null;
}

async function logActivity(env, adminName, action, details) {
    const time = new Date().toLocaleString();
    await env.DB.prepare("INSERT INTO activity_log (time, admin_name, action, details) VALUES (?, ?, ?, ?)")
        .bind(time, adminName, action, details).run();
}
