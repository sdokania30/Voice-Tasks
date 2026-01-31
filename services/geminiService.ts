import { GoogleGenAI, Type } from "@google/genai";
import {
  Priority,
  Task,
  ReminderOption,
  Trade,
  Tag,
  RecurringPayment,
} from "../types";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
const model = "gemini-2.5-flash";

const processedTasksSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "A concise, actionable title for the task.",
      },
      rawText: {
        type: Type.STRING,
        description:
          "The original text segment from the transcript that corresponds to this single task.",
      },
      when: {
        type: Type.STRING,
        description:
          "The specific due date, time, and estimated completion time (ETA) mentioned. Consolidate all into this one field. Format it clearly, e.g., 'Nov 6, 2024 at 6:00 PM (ETA: 2h)'. Avoid relative terms like 'today' or 'tomorrow'.",
      },
      priority: {
        type: Type.STRING,
        enum: Object.values(Priority),
        description:
          "The priority of the task. Infer from keywords like 'urgent', 'asap', or importance. Default to Medium if unsure.",
      },
      tag: {
        type: Type.STRING,
        enum: Object.values(Tag),
        description: `Categorize the task into one of the following: ${Object.values(Tag).join(", ")}. If none are relevant or no category is mentioned, default to 'Others'.`,
      },
      reminder: {
        type: Type.STRING,
        enum: Object.values(ReminderOption),
        description:
          "When to send a reminder. Infer from phrases like 'remind me 15 minutes before'. If no reminder is specified, this field must be null.",
      },
      subtasks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A subtask title." },
          },
        },
        description:
          "Break down complex tasks into exactly 1 or 2 smaller subtasks. Do not exceed 2 subtasks.",
      },
    },
    required: ["title", "when", "priority", "rawText"],
  },
};

export const processTranscriptToTasks = async (
  transcript: string,
): Promise<Partial<Task>[]> => {
  if (!transcript.trim()) {
    return [];
  }
  const currentDate = new Date().toISOString();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Analyze the following transcript, which may contain multiple tasks. The current date is ${currentDate}.
            1. Clean up filler words and transcription errors.
            2. For each distinct task, create a JSON object.
            3. 'rawText': The original snippet for the task.
            4. 'when': This is the primary time field. Consolidate due date, time, and ETA into it.
                - Format it explicitly (e.g., "Nov 6, 2024 at 5pm (ETA: 30m)"), not relatively ("tomorrow").
                - If no date is mentioned, default to today's date (${new Date().toDateString()}).
                - For "EOD", assume 5 PM of the relevant day.
            5. 'tag': Categorize the task into one of these options: ${Object.values(Tag).join(", ")}. If unsure, use 'Others'.
            6. 'reminder': These fields must be null if not explicitly mentioned in the transcript. Do not add default values.
            7. 'subtasks': If a task implies multiple steps (e.g., "Plan a party"), create 1 or maximum 2 logical subtasks.
            8. If no specific time is mentioned for a task, do not infer or add a default time (like 9:00 AM); only include the date information.
            9. Return a JSON array of these task objects.

            Transcript: "${transcript}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: processedTasksSchema,
      },
    });

    const jsonStr = response.text.trim();
    const tasks = JSON.parse(jsonStr);

    return tasks.map((task: any) => ({
      ...task,
      id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      isCompleted: false,
      subtasks: task.subtasks
        ? task.subtasks.map((st: any) => ({
            id: Math.random().toString(36).substr(2, 9),
            title: st.title,
            isCompleted: false,
          }))
        : [],
      priority: Object.values(Priority).includes(task.priority)
        ? task.priority
        : Priority.MEDIUM,
      reminder:
        task.reminder === "null" || task.reminder === ReminderOption.NONE
          ? undefined
          : task.reminder,
      tag:
        task.tag === "null" || !Object.values(Tag).includes(task.tag)
          ? Tag.OTHERS
          : (task.tag as Tag),
    }));
  } catch (error) {
    console.error("Error processing transcript to tasks:", error);
    return [
      {
        id: `temp-error-${Date.now()}`,
        title: "Could not process transcript",
        rawText: `Error during AI processing. Please check your input or try again. Details: ${error instanceof Error ? error.message : String(error)}`,
        when: "Unscheduled",
        priority: Priority.MEDIUM,
        tag: undefined,
        isCompleted: false,
        subtasks: [],
      },
    ];
  }
};

const processedTradesSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      stockName: {
        type: Type.STRING,
        description: "The name or ticker symbol of the stock.",
      },
      entryPrice: {
        type: Type.NUMBER,
        description: "The price at which the stock was bought.",
      },
      quantity: {
        type: Type.INTEGER,
        description: "The number of shares traded.",
      },
      stopLoss: {
        type: Type.NUMBER,
        description:
          "The calculated stop-loss as a percentage. This is a crucial field. If the user provides a price, calculate the percentage relative to the entry price.",
      },
      entryDate: {
        type: Type.STRING,
        description:
          "The date of the trade, converted into a machine-readable ISO 8601 date string (YYYY-MM-DD).",
      },
      reason: {
        type: Type.STRING,
        description:
          "A concise, well-written reason for taking the trade, based on the user's explanation. If no reason is provided, this should be an empty string.",
      },
    },
    required: [
      "stockName",
      "entryPrice",
      "quantity",
      "stopLoss",
      "entryDate",
      "reason",
    ],
  },
};

export const processTranscriptToTrades = async (
  transcript: string,
): Promise<Partial<Trade>[]> => {
  if (!transcript.trim()) {
    return [];
  }
  const currentDate = new Date().toISOString();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Analyze the following transcript to identify stock trades. The current date is ${currentDate}.
            For each trade identified, extract the following information into a JSON object:
            1. 'stockName': The ticker symbol or company name.
            2. 'entryPrice': The price per share at entry. Assume currency is Rupees (INR) unless specified otherwise.
            3. 'quantity': The number of shares.
            4. 'entryDate': The date of the trade. Convert it to an ISO 8601 string (YYYY-MM-DD). Use today's date if not specified.
            5. 'stopLoss': This is a critical calculation. You must return the stop-loss as a PERCENTAGE.
                - If a percentage is given (e.g., '5% stop loss'), use that percentage number directly (e.g., 5).
                - If a specific price is given (e.g., 'stop loss at 95' for an entry of 100.23), you MUST calculate the percentage: \`((entryPrice - stopLossPrice) / entryPrice) * 100\`. Round the result to two decimal places.
                - The final value in the JSON MUST be a number representing the percentage.
            6. 'reason': Extract the user's justification for the trade. Clean up the language, fix grammar, and make it a concise, well-written reason. If no reason is given, this should be an empty string.
            
            Return a JSON array of these trade objects.

            Transcript: "${transcript}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: processedTradesSchema,
      },
    });

    const jsonStr = response.text.trim();
    const trades = JSON.parse(jsonStr);

    return trades.map((trade: any) => ({
      ...trade,
      id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    }));
  } catch (error) {
    console.error("Error processing transcript to trades:", error);
    return [
      {
        id: `temp-error-${Date.now()}`,
        stockName: `Error: ${error instanceof Error ? error.message : String(error)}`,
        entryPrice: 0,
        quantity: 0,
        stopLoss: 0,
        entryDate: new Date().toISOString(),
        reason: "Failed to process transcript.",
      },
    ];
  }
};

const processedPaymentsSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      serviceName: {
        type: Type.STRING,
        description:
          "The name of the service or bill (e.g., Netflix, Rent, Gym).",
      },
      amount: {
        type: Type.NUMBER,
        description:
          "The payment amount. Assume currency is Rupees (INR) unless specified otherwise.",
      },
      dueDay: {
        type: Type.INTEGER,
        description: "The day of the month the payment is due (1-31).",
      },
    },
    required: ["serviceName", "amount", "dueDay"],
  },
};

export const processTranscriptToPayments = async (
  transcript: string,
): Promise<Partial<RecurringPayment>[]> => {
  if (!transcript.trim()) {
    return [];
  }
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Analyze the following transcript to identify recurring payments.
            For each payment, extract:
            1. 'serviceName': Name of the service.
            2. 'amount': The cost. Unless explicitly stated otherwise (like '$' or 'dollars'), assume the currency is Rupees (INR).
            3. 'dueDay': The day of the month (1-31) it is due. If a user says "first", it is 1. If "end of month", assume 30 or 31.
            
            Return a JSON array.
            Transcript: "${transcript}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: processedPaymentsSchema,
      },
    });

    const jsonStr = response.text.trim();
    const payments = JSON.parse(jsonStr);

    return payments.map((p: any) => ({
      ...p,
      id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    }));
  } catch (error) {
    console.error("Error processing transcript to payments:", error);
    return [];
  }
};
