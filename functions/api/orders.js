export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === "GET") {
        const { results: orders } = await env.DB.prepare("SELECT * FROM orders ORDER BY timestamp DESC").all();
        const { results: items } = await env.DB.prepare("SELECT * FROM order_items").all();
        
        orders.forEach(o => {
            o.items = items.filter(i => i.order_id === o.id);
        });
        return Response.json(orders);
    }

    if (request.method === "POST") {
        const body = await request.json();
        const { action } = body;

        if (action === "create") {
            const { cadetName, flight, basket } = body;
            
            // Transaction-like check & reserve to prevent double-booking last items
            for (const line of basket) {
                const item = await env.DB.prepare("SELECT * FROM inventory WHERE id = ?").bind(line.invId).first();
                if (!item || item.qty < line.qty) {
                    return Response.json({ success: false, error: `Sorry, ${item ? item.title : 'item'} is out of stock.` }, { status: 400 });
                }
            }

            const refCode = 'ATC-' + Math.floor(1000 + Math.random() * 9000);
            const timestamp = new Date().toLocaleString();

            await env.DB.prepare("INSERT INTO orders (id, cadet_name, flight, cadet_id, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(refCode, cadetName, flight, 'N/A', timestamp, 'Pending').run();

            for (const line of basket) {
                const item = await env.DB.prepare("SELECT * FROM inventory WHERE id = ?").bind(line.invId).first();
                await env.DB.prepare("INSERT INTO order_items (order_id, inv_id, title, category, gender, size, qty) VALUES (?, ?, ?, ?, ?, ?, ?)")
                    .bind(refCode, item.id, item.title, item.category, item.gender, item.size, line.qty).run();
                
                await env.DB.prepare("UPDATE inventory SET qty = qty - ? WHERE id = ?").bind(line.qty, item.id).run();
            }

            return Response.json({ success: true, refCode });
        }

        if (action === "updateStatus") {
            const { orderId, newStatus, pin } = body;
            const admin = await verifyAdmin(pin, env);
            if (!admin) return new Response("Unauthorized", { status: 401 });

            const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
            if (!order) return new Response("Order not found", { status: 404 });

            if (newStatus === 'Cancelled' && order.status !== 'Cancelled') {
                const { results: items } = await env.DB.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(orderId).all();
                for (const line of items) {
                    await env.DB.prepare("UPDATE inventory SET qty = qty + ? WHERE id = ?").bind(line.qty, line.inv_id).run();
                }
            }

            await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(newStatus, orderId).run();
            await logActivity(env, admin.name, "Order status changed", `${orderId} (${order.cadet_name}): ${order.status} → ${newStatus}`);

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
