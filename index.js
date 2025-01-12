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
    "http://192.168.0.109:3000",
    "https://ena-ema-task-for-client.vercel.app",
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

    // Save  spending limit post route to the database
    app.post("/spendingLimit", async (req, res) => {
      try {
        const spendingLimit = req.body;

        if (!spendingLimit.userId) {
          return res.status(400).send({ message: "User ID is required." });
        }

        const filter = { userId: spendingLimit.userId };
        const updateDoc = { $set: spendingLimit };
        const options = { upsert: true };

        const result = await spendingLimitCollection.updateOne(
          filter,
          updateDoc,
          options
        );

        if (result.matchedCount > 0) {
          res.send({
            message: "Existing user's spending limit updated successfully.",
            result,
          });
        } else if (result.upsertedCount > 0) {
          res.send({
            message: "New user's spending limit added successfully.",
            result,
          });
        } else {
          res.status(500).send({ message: "Unexpected issue occurred." });
        }
      } catch (error) {
        console.error("Error saving spending limit:", error);
        res.status(500).send({ message: "Internal server error." });
      }
    });

    // Add or update expense post route with limit check

    app.post("/expenses", async (req, res) => {
      try {
        const { category, purpose, amount, userId, date } = req.body;

        if (!category || !purpose || !amount || !userId) {
          return res.status(400).send({
            message:
              "All fields (category, purpose, amount, userId) are required.",
          });
        }

        const numericAmount = Number(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
          return res.status(400).send({
            message: "The 'amount' field must be a positive numeric value.",
          });
        }

        const userLimit = await spendingLimitCollection.findOne({ userId });
        if (!userLimit) {
          return res.status(400).send({
            message:
              "Spending limit not set for this user. Please set a limit first.",
          });
        }

        const totalCategoryExpenses = await expensesCollection
          .aggregate([
            { $match: { userId, category } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
          .toArray();
        const currentCategoryTotal = totalCategoryExpenses[0]?.total || 0;

        const categoryLimit = userLimit[category.toLowerCase()];
        if (
          categoryLimit !== undefined &&
          currentCategoryTotal + numericAmount > categoryLimit
        ) {
          return res.status(400).send({
            message: `Adding this expense exceeds the spending limit for ${category}.`,
          });
        }

        const result = await expensesCollection.findOneAndUpdate(
          { userId, category },
          { $inc: { amount: numericAmount }, $set: { purpose, date } },
          { upsert: true, returnDocument: "after" }
        );

        res.send({
          message: "Expense updated successfully.",
          expense: result.value,
        });
      } catch (error) {
        console.error("Error:", error);
        res.status(500).send({ message: "Internal server error." });
      }
    });

    // daily expenses summary get route
    // app.get("/expenses/:userId", async (req, res) => {
    //   const { userId, date } = req.params;

    //   try {
    //     const expenses = await expensesCollection
    //       .find({ userId, date })
    //       .toArray();

    //     if (expenses.length === 0) {
    //       return res.status(200).send({ expenses: {}, totalExpense: 0, date });
    //     }

    //     const groupedExpenses = expenses.reduce((acc, expense) => {
    //       const { category, amount } = expense;
    //       if (!acc[category]) {
    //         acc[category] = 0;
    //       }
    //       acc[category] += amount;
    //       return acc;
    //     }, {});

    //     const totalExpense = expenses.reduce(
    //       (total, expense) => total + expense.amount,
    //       0
    //     );

    //     res.status(200).send({
    //       expenses: groupedExpenses,
    //       totalExpense,
    //       date,
    //     });
    //   } catch (error) {
    //     console.error("Error fetching expenses:", error);
    //     res.status(500).send({ message: "Internal server error." });
    //   }
    // });



    // app.get("/expenses/:userId/:date", async (req, res) => {
    //   const { userId, date } = req.params;
    //   try {
    //     const expenses = await expensesCollection
    //       .find({ 
    //         userId, 
    //         date: new RegExp(date, 'i') 
    //       })
    //       .toArray();
    
    //     if (expenses.length === 0) {
    //       return res.status(200).send({ 
    //         expenses: {}, 
    //         totalExpense: 0, 
    //         date 
    //       });
    //     }
    
    //     const groupedExpenses = expenses.reduce((acc, expense) => {
    //       const { category, amount } = expense;
    //       acc[category] = (acc[category] || 0) + amount;
    //       return acc;
    //     }, {});
    
    //     const totalExpense = Object.values(groupedExpenses)
    //       .reduce((total, amount) => total + amount, 0);
    
    //     res.status(200).send({
    //       expenses: groupedExpenses,
    //       totalExpense,
    //       date
    //     });
    //   } catch (error) {
    //     console.error("Error fetching expenses:", error);
    //     res.status(500).send({ message: "Internal server error." });
    //   }
    // });


    // app.get("/expenses/:userId", async (req, res) => {
    //   const { userId } = req.params;
    //   const { date } = req.query;
    
    //   try {
    //     const expenses = await expensesCollection.find({ userId, date }).toArray();
    
    //     if (expenses.length === 0) {
    //       return res.status(200).send({ expenses: {}, totalExpense: 0, date });
    //     }
    
    //     const groupedExpenses = expenses.reduce((acc, expense) => {
    //       const { category, amount } = expense;
    //       if (!acc[category]) {
    //         acc[category] = 0;
    //       }
    //       acc[category] += amount;
    //       return acc;
    //     }, {});
    
    //     const totalExpense = expenses.reduce(
    //       (total, expense) => total + expense.amount,
    //       0
    //     );
    
    //     res.status(200).send({
    //       expenses: groupedExpenses,
    //       totalExpense,
    //       date,
    //     });
    //   } catch (error) {
    //     console.error("Error fetching expenses:", error);
    //     res.status(500).send({ message: "Internal server error." });
    //   }
    // });


    app.get("/expenses/:userId/monthly", async (req, res) => {
      const { userId } = req.params;
      const { month } = req.query; // Format: "YYYY-MM"
    
      try {
        const startDate = new Date(`${month}-01`);
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    
        const expenses = await expensesCollection
          .find({
            userId,
            date: {
              $gte: startDate.toISOString().split("T")[0],
              $lte: endDate.toISOString().split("T")[0],
            },
          })
          .toArray();
    
        const groupedExpenses = {};
    
        expenses.forEach((expense) => {
          const { date, category, amount } = expense;
          if (!groupedExpenses[date]) {
            groupedExpenses[date] = {};
          }
          if (!groupedExpenses[date][category]) {
            groupedExpenses[date][category] = 0;
          }
          groupedExpenses[date][category] += amount;
        });
    
        res.status(200).send(groupedExpenses);
      } catch (error) {
        console.error("Error fetching monthly expenses:", error);
        res.status(500).send({ message: "Internal server error." });
      }
    });
    
    
    

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
