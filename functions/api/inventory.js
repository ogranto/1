export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    if (request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM inventory").all();
        return Response.json(results);
    }

    if (request.method === "POST") {
        const body = await request.json();
        const { action, id, delta, pin, newItem } = body;

        // Check Admin PIN for modifications
        const admin = await verifyAdmin(pin, env);
        if (!admin) return new Response("Unauthorized", { status: 401 });

        if (action === "adjust") {
            const item = await env.DB.prepare("SELECT * FROM inventory WHERE id = ?").bind(id).first();
            if (!item) return new Response("Item not found", { status: 404 });
            
            const newQty = Math.max(0, item.qty + delta);
            await env.DB.prepare("UPDATE inventory SET qty = ? WHERE id = ?").bind(newQty, id).run();
            
            if (item.qty !== newQty) {
                await logActivity(env, admin.name, "Stock adjusted", `${item.title} (${item.size}): ${item.qty} → ${newQty}`);
            }
            return Response.json({ success: true, newQty });
        }

        if (action === "add") {
            if (!admin.full) return new Response("Forbidden", { status: 403 });
            await env.DB.prepare("INSERT INTO inventory (id, title, category, gender, size, qty) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(newItem.id, newItem.title, newItem.category, newItem.gender, newItem.size, newItem.qty).run();
            await logActivity(env, admin.name, "Inventory item added", `${newItem.title} (${newItem.size})`);
            return Response.json({ success: true });
        }

        if (action === "delete") {
            if (!admin.full) return new Response("Forbidden", { status: 403 });
            const item = await env.DB.prepare("SELECT * FROM inventory WHERE id = ?").bind(id).first();
            await env.DB.prepare("DELETE FROM inventory WHERE id = ?").bind(id).run();
            if (item) await logActivity(env, admin.name, "Inventory item deleted", `${item.title} (${item.size})`);
            return Response.json({ success: true });
        }

        if (action === "reset") {
            if (!admin.full) return new Response("Forbidden", { status: 403 });
            await env.DB.prepare("DELETE FROM inventory").run();
            await env.DB.prepare("DELETE FROM orders").run();
            await env.DB.prepare("DELETE FROM order_items").run();
            await logActivity(env, admin.name, "Reset Database", "All records cleared");
            return Response.json({ success: true });
        }
    }
    return new Response("Method not allowed", { status: 405 });
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
