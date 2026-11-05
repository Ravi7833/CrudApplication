import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const ITEMS_TABLE = "ServerlessCrudTable"; // Aapki items table
const ORDERS_TABLE = "CloudStoreOrdersTable"; // Nayi orders table (Partition Key: userId, Sort Key: orderId)

export const handler = async (event) => {
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    // Cognito Token se User ID (sub) extract karna
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || "guest";

    try {
        // --- 1. ITEMS CRUD ---
        if (path === "/items") {
            if (method === "GET") {
                const res = await docClient.send(new ScanCommand({ TableName: ITEMS_TABLE }));
                return { statusCode: 200, body: JSON.stringify(res.Items || []) };
            }
            if (method === "POST") {
                const body = JSON.parse(event.body);
                await docClient.send(new PutCommand({ TableName: ITEMS_TABLE, Item: body }));
                return { statusCode: 200, body: JSON.stringify({ message: "Item saved successfully" }) };
            }
        }

        // --- 2. ORDER HISTORY & PROFILE ENDPOINTS ---
        if (path === "/orders") {
            // User ke specific orders fetch karna
            if (method === "GET") {
                if (userId === "guest") {
                    return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };
                }
                const res = await docClient.send(new QueryCommand({
                    TableName: ORDERS_TABLE,
                    KeyConditionExpression: "userId = :uid",
                    ExpressionAttributeValues: { ":uid": userId }
                }));
                return { statusCode: 200, body: JSON.stringify(res.Items || []) };
            }

            // Naya Order Save karna
            if (method === "POST") {
                if (userId === "guest") {
                    return { statusCode: 401, body: JSON.stringify({ message: "Must be logged in to place order" }) };
                }
                const body = JSON.parse(event.body);
                const orderItem = {
                    userId: userId,
                    orderId: `ORD-${Date.now()}`,
                    items: body.items,
                    totalAmount: body.totalAmount,
                    orderDate: new Date().toISOString(),
                    status: "CONFIRMED"
                };
                await docClient.send(new PutCommand({ TableName: ORDERS_TABLE, Item: orderItem }));
                return { statusCode: 200, body: JSON.stringify({ message: "Order placed successfully!", order: orderItem }) };
            }
        }

        return { statusCode: 404, body: JSON.stringify({ message: "Not Found" }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
