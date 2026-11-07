import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const ITEMS_TABLE = "ItemsTable";
const ORDERS_TABLE = "CloudStoreOrdersTable";

export const handler = async (event) => {
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    const claims = event.requestContext.authorizer?.jwt?.claims || {};
    const userId = claims.sub || "guest";
    
    // Fallback: Token claims ya Custom Header se email check karna
    const headers = event.headers || {};
    const userEmail = claims.email || headers['x-user-email'] || ""; 
    
    const ADMIN_EMAIL = "rk00828431@gmail.com"; 
    const isAdmin = (userEmail === ADMIN_EMAIL);

    try {
        if (path === "/items") {
            if (method === "GET") {
                const res = await docClient.send(new ScanCommand({ TableName: ITEMS_TABLE }));
                return { statusCode: 200, body: JSON.stringify(res.Items || []) };
            }
            
            if (method === "POST" || method === "PUT") {
                if (!isAdmin) {
                    return { statusCode: 403, body: JSON.stringify({ message: "Access Denied: Admins only!", receivedEmail: userEmail }) };
                }
                const body = JSON.parse(event.body);
                await docClient.send(new PutCommand({ TableName: ITEMS_TABLE, Item: body }));
                return { statusCode: 200, body: JSON.stringify({ message: "Item saved successfully" }) };
            }

            if (method === "DELETE") {
                if (!isAdmin) {
                    return { statusCode: 403, body: JSON.stringify({ message: "Access Denied: Admins only!" }) };
                }
                const body = JSON.parse(event.body || "{}");
                const itemId = body.id;
                if (!itemId) {
                    return { statusCode: 400, body: JSON.stringify({ message: "Item ID is required for deletion" }) };
                }
                await docClient.send(new DeleteCommand({ TableName: ITEMS_TABLE, Key: { id: itemId } }));
                return { statusCode: 200, body: JSON.stringify({ message: "Item deleted successfully" }) };
            }
        }

        if (path === "/orders") {
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
