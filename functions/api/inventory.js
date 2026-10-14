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
        const admin = verifyAdmin(pin, env);
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

function verifyAdmin(pin, env) {
    if (pin && pin === env.PIN_OSCAR_GRANT) return { name: 'Oscar Grant', full: true };
    if (pin && pin === env.PIN_TILLY_BRITTON) return { name: 'Tilly Britton', full: false };
    if (pin && pin === env.PIN_SAM_BIRTHWRIGHT) return { name: 'Sam Birthwright', full: false };
    return null;
}

async function logActivity(env, adminName, action, details) {
    const time = new Date().toLocaleString();
    await env.DB.prepare("INSERT INTO activity_log (time, admin_name, action, details) VALUES (?, ?, ?, ?)")
        .bind(time, adminName, action, details).run();
}
