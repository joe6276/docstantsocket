const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')
const mssql = require('mssql')
const { sqlConfig } = require('./config')

const app = express()
app.use(cors())

const server = http.createServer(app);


const io = new Server(server, {
    cors: {
        origin: "*"
    }
})

const connectedUsers = {};


io.on("connection", async (socket) => {
    console.log(" new user connected", socket.id);

    socket.on("register", (userId) => {
        connectedUsers[userId] = socket.id;
    });
    socket.on("chat_message", async (data) => {
        const { senderId, receiverId, content } = data;
        // Save to DB
        try {
            console.log(senderId,receiverId,content);
            
            const pool = await mssql.connect(sqlConfig);
            await pool.request()
                .query(`INSERT INTO Messages (senderId, receiverId, content, createdAt) VALUES ('${senderId}', '${receiverId}', '${content}',GETDATE())`);

            const receiverSocket = connectedUsers[receiverId];
            if (receiverSocket) {
                io.to(receiverSocket).emit("receive_message", { senderId, message });
            }
        } catch (error) {
            console.log(error);
            
        }
    })

     // Load chat history
  socket.on("load_chat", async (data) => {
    const { userA, userB } = data;
    const pool = await mssql.connect(sqlConfig);
    const result = await pool.request()
      .input("userA", userA)
      .input("userB", userB)
      .query(`
        SELECT SenderId, ReceiverId, Content, CreatedAt
        FROM Messages
        WHERE (SenderId = @userA AND ReceiverId = @userB)
           OR (SenderId = @userB AND ReceiverId = @userA)
        ORDER BY CreatedAt ASC
      `);

    socket.emit("chat_history", result.recordset);
  });

    socket.on('notify', async (data) => {
        try {
            const { userId, title, message, fromUserId, toUserId, fromDepartment, toDepartment } = data
            const query = `INSERT INTO Notifications (
  Title,
  Message,
  FromUserId,
  ToUserId,
  FromDepartment,
  ToDepartment,
  CreatedAt,
  IsRead
)
VALUES (
  '${title}',
  '${message}',
  '${fromUserId}',
  '${toUserId}',
  '${fromDepartment}',
  '${toDepartment}',
  GETDATE(),
  0
);`

            const pool = await mssql.connect(sqlConfig)
            await pool.request().query(query)

            const targetSocket = connectedUsers[userId];
            if (targetSocket) {
                io.to(targetSocket).emit("new_notification", { message });
            }
        } catch (error) {
            console.error("Error sending notification:", err);
        }

    })

  socket.on("disconnect", () => {
    for (const uid in connectedUsers) {
      if (connectedUsers[uid] === socket.id) {
        delete connectedUsers[uid];
        break;
      }
    }
  });

})

server.listen(4000, () => {
    console.log('Server Running on 4000:');

})