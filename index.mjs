import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  GetCommand, 
  PutCommand, 
  DeleteCommand 
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = "ItemsTable";

export const handler = async (event) => {
  const httpMethod = event.requestContext.http.method;
  const path = event.rawPath;
  let responseBody = "";
  let statusCode = 200;

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
  };

  try {
    switch (httpMethod) {
      case "GET":
        if (event.pathParameters && event.pathParameters.id) {
          // Get a single item
          const command = new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: event.pathParameters.id }
          });
          const result = await docClient.send(command);
          responseBody = result.Item ? result.Item : { message: "Item not found" };
        } else {
          // Scan all items
          const command = new ScanCommand({ TableName: TABLE_NAME });
          const result = await docClient.send(command);
          responseBody = result.Items;
        }
        break;

      case "POST":
      case "PUT":
        const requestBody = JSON.parse(event.body);
        const putCommand = new PutCommand({
          TableName: TABLE_NAME,
          Item: requestBody
        });
        await docClient.send(putCommand);
        responseBody = { message: "Item saved successfully", item: requestBody };
        break;

      case "DELETE":
        const itemId = event.pathParameters?.id;
        if (!itemId) {
          statusCode = 400;
          responseBody = { message: "Missing item ID for deletion" };
          break;
        }
        const deleteCommand = new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: itemId }
        });
        await docClient.send(deleteCommand);
        responseBody = { message: `Item ${itemId} deleted successfully` };
        break;

      default:
        statusCode = 405;
        responseBody = { message: `Unsupported method ${httpMethod}` };
    }
  } catch (err) {
    statusCode = 500;
    responseBody = { error: err.message };
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(responseBody),
  };
};
