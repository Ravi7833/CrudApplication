import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const ITEMS_TABLE = "ItemsTable";
const ORDERS_TABLE = "CloudStoreOrdersTable";

const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-User-Email",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
};

export const handler = async (event) => {
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    if (method === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    const claims = event.requestContext.authorizer?.jwt?.claims || {};
    const userId = claims.sub || "guest";
    const ADMIN_SUB = "81739d4a-4001-70f0-1907-d763fb1d24e5"; 
    const isAdmin = (userId === ADMIN_SUB);

    try {
        if (path === "/items") {
            if (method === "GET") {
                const res = await docClient.send(new ScanCommand({ TableName: ITEMS_TABLE }));
                const items = (res.Items || []).map(item => ({
                    id: item.id || "N/A",
                    name: item.name || "Untitled Product",
                    price: item.price !== undefined ? item.price : 999,
                    category: item.category || "General",
                    image: item.image && item.image !== "<empty>" ? item.image : "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400"
                }));
                return { statusCode: 200, headers, body: JSON.stringify(items) };
            }
            
            if (method === "POST" || method === "PUT") {
                if (!isAdmin) {
                    return { statusCode: 403, headers, body: JSON.stringify({ message: "Access Denied: Admins only!" }) };
                }
                const body = JSON.parse(event.body);
                await docClient.send(new PutCommand({ TableName: ITEMS_TABLE, Item: body }));
                return { statusCode: 200, headers, body: JSON.stringify({ message: "Item saved successfully" }) };
            }

            if (method === "DELETE") {
                if (!isAdmin) {
                    return { statusCode: 403, headers, body: JSON.stringify({ message: "Access Denied: Admins only!" }) };
                }
                const body = JSON.parse(event.body || "{}");
                const itemId = body.id;
                if (!itemId) {
                    return { statusCode: 400, headers, body: JSON.stringify({ message: "Item ID is required for deletion" }) };
                }
                await docClient.send(new DeleteCommand({ TableName: ITEMS_TABLE, Key: { id: itemId } }));
                return { statusCode: 200, headers, body: JSON.stringify({ message: "Item deleted successfully" }) };
            }
        }

        if (path === "/orders") {
            if (method === "GET") {
                if (userId === "guest") {
                    return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
                }
                const res = await docClient.send(new QueryCommand({
                    TableName: ORDERS_TABLE,
                    KeyConditionExpression: "userId = :uid",
                    ExpressionAttributeValues: { ":uid": userId }
                }));
                return { statusCode: 200, headers, body: JSON.stringify(res.Items || []) };
            }

            if (method === "POST") {
                if (userId === "guest") {
                    return { statusCode: 401, headers, body: JSON.stringify({ message: "Must be logged in to place order" }) };
                }
                const body = JSON.parse(event.body);
                const orderItem = {
                    userId: userId,
                    orderId: `ORD-${Date.now()}`,
                    items: body.items,
                    totalAmount: body.totalAmount,
                    paymentId: body.paymentId || "TEST-PAID",
                    orderDate: new Date().toISOString(),
                    status: "PAID & CONFIRMED"
                };
                await docClient.send(new PutCommand({ TableName: ORDERS_TABLE, Item: orderItem }));
                return { statusCode: 200, headers, body: JSON.stringify({ message: "Order placed successfully!", order: orderItem }) };
            }
        }

        return { statusCode: 404, headers, body: JSON.stringify({ message: "Not Found" }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
