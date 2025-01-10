const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3001;

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://ena-ema-task-for-client.vercel.app"

    
  ],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uoysey8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const expensesCollection = client
      .db("ExpenseTracker")
      .collection("expenses");
    const spendingLimitCollection = client
      .db("ExpenseTracker")
      .collection("spendingLimits");

    // Add login endpoint
    app.post("/login", async (req, res) => {
      try {
        const { name, email } = req.body;

        // Validate input
        if (!name || !email) {
          return res
            .status(400)
            .send({ message: "Name and email are required." });
        }

        // Check if the user already exists
        const usersCollection = client.db("ExpenseTracker").collection("users");
        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          return res
            .status(200)
            .send({ message: "User already exists.", user: existingUser });
        }

        // Save the new user
        const newUser = { name, email, createdAt: new Date() };
        const result = await usersCollection.insertOne(newUser);
        res
          .status(201)
          .send({ message: "User added successfully!", user: newUser });
      } catch (error) {
        console.error("Error saving user:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Save spending limit
    app.post("/spendingLimit", async (req, res) => {
      const { category, limit } = req.body;
      try {
        const existingLimit = await spendingLimitCollection.findOne({
          category,
        });
        if (existingLimit) {
          return res
            .status(400)
            .send({ message: "Spending limit already set for this category" });
        }
        const result = await spendingLimitCollection.insertOne({
          category,
          limit,
        });
        res.send({ message: "Spending limit saved successfully", result });
      } catch (error) {
        res.status(500).send({ message: "Error saving spending limit", error });
      }
    });

    // Add expense with limit check

    app.post("/expenses", async (req, res) => {
      try {
        const { category, amount, userEmail } = req.body;

        // Get user's spending limit for the specific category
        const spendingLimit = await spendingLimitCollection.findOne({
          email: userEmail,
          category,
        });

        if (!spendingLimit) {
          return res
            .status(400)
            .send({ message: "Spending limit not set for this category" });
        }

        // Get all expenses of the user for that category
        const totalSpent = await expensesCollection
          .aggregate([
            { $match: { userEmail, category } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
          .toArray();

        const totalSpentAmount = totalSpent.length ? totalSpent[0].total : 0;

        // Check if the expense will exceed the limit
        if (totalSpentAmount + amount > spendingLimit.limit) {
          return res.status(400).send({
            message: `You have exceeded your spending limit of ${spendingLimit.limit} for this category.`,
          });
        }

        // Proceed with adding the expense if within the limit
        const expenseData = {
          category,
          amount,
          userEmail,
          date: new Date().toLocaleString(),
        };
        const result = await expensesCollection.insertOne(expenseData);
        res.send(result);
      } catch (error) {
        console.error("Error saving expense:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    //   const { category, amount } = req.body;
    //   try {
    //     const spendingLimit = await spendingLimitCollection.findOne({ category });
    //     const totalSpent = await expensesCollection
    //       .aggregate([
    //         { $match: { category } },
    //         { $group: { _id: null, total: { $sum: "$amount" } } },
    //       ])
    //       .toArray();

    //     const totalAmount = totalSpent[0]?.total || 0;
    //     if (totalAmount + amount > spendingLimit.limit) {
    //       return res.status(400).send({ message: 'Spending limit exceeded for this category' });
    //     }

    //     const result = await expensesCollection.insertOne(req.body);
    //     res.send({ message: 'Expense added successfully', result });
    //   } catch (error) {
    //     res.status(500).send({ message: 'Error adding expense', error });
    //   }
    // });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
