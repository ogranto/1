DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS activity_log;

CREATE TABLE inventory (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    gender TEXT NOT NULL,
    size TEXT NOT NULL,
    qty INTEGER NOT NULL
);

CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    cadet_name TEXT NOT NULL,
    flight TEXT NOT NULL,
    cadet_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL
);

CREATE TABLE order_items (
    order_id TEXT,
    inv_id TEXT,
    title TEXT,
    category TEXT,
    gender TEXT,
    size TEXT,
    qty INTEGER,
    FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    admin_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL
);
