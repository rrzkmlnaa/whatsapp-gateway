import { Request, Response } from "express";
import { db } from "../../config/database/database";
import { and, between, count, eq, sql } from "drizzle-orm";
import { contacts } from "../contacts/contacts.schema";
import { messages } from "../messages/messages.schema";
import { labels } from "../labels/labels.schema";
import { groups } from "../groups/group.schema";

const sevenDaysAgo = sql`DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
const today = sql`CURDATE()`;

// Extract phone number helper
const phoneNumberPath = "$[0].information.to";
const phoneNumberQuery = sql`REPLACE(REPLACE(REPLACE(
    JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, ${phoneNumberPath})),
    '@c.us', ''), '+', ''), '-', '')`;

export class DashboardController {
  // Count utility functions
  static async countContacts() {
    const result = await db.select({ count: count() }).from(contacts);
    return result[0]?.count || 0;
  }

  static async countMessages(whereCondition = sql`1=1`) {
    const result = await db
      .select({ count: count() })
      .from(messages)
      .where(whereCondition);
    return result[0]?.count || 0;
  }

  static async countLabels() {
    const result = await db.select({ count: count() }).from(labels);
    return result[0]?.count || 0;
  }

  static async countGroups() {
    const result = await db.select({ count: count() }).from(groups);
    return result[0]?.count || 0;
  }

  // Get all messages without contact details
  static async getAllMessages() {
    return await db.select().from(messages);
  }

  // Function to get messages in a specific time range
  static async getMessagesInRange(startTime: string, endTime: string) {
    return await db
      .select()
      .from(messages)
      .innerJoin(contacts, eq(phoneNumberQuery, contacts.number))
      .where(
        and(
          sql`DATE(STR_TO_DATE(
            JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, '$[last].information.timestamp')),
            '%d/%m/%Y, %H.%i.%s'
          )) = CURDATE()`,
          sql`TIME(STR_TO_DATE(
            JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, '$[last].information.timestamp')),
            '%d/%m/%Y, %H.%i.%s'
          )) BETWEEN ${startTime} AND ${endTime}`
        )
      );
  }

  // Format messages by extracting the last message
  static formatMessages(messagesList: any[]) {
    return messagesList.map((message: any) => ({
      hasFollowUp:
        message.messages.message[message.messages.message.length - 1]
          .information.fromMe,
      contact: message.contacts,
      message: message.messages.message[message.messages.message.length - 1],
    }));
  }

  // Fetch dashboard data
  static async index(_req: Request, res: Response) {
    try {
      // Get counts
      const totalContact = await DashboardController.countContacts();
      const totalMessage = await DashboardController.countMessages(
        sql`JSON_LENGTH(${messages.message}) != 0`
      );
      const totalLabel = await DashboardController.countLabels();
      const totalGroup = await DashboardController.countGroups();

      // Get messages for today
      const totalNewMessageToday = await DashboardController.countMessages(
        sql`DATE(STR_TO_DATE(
          JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, '$[last].information.timestamp')),
          '%d/%m/%Y, %H.%i.%s'
        )) = CURDATE() AND JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, '$[last].information.fromMe')) = 'false'`
      );

      const totalMessageTodayFromMe = await DashboardController.countMessages(
        sql`DATE(STR_TO_DATE(
          JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, '$[last].information.timestamp')),
          '%d/%m/%Y, %H.%i.%s'
        )) = CURDATE() AND JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, '$[last].information.fromMe')) = 'true'`
      );

      const totalAllMessageToday = await DashboardController.countMessages(
        sql`DATE(STR_TO_DATE(
          JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, '$[last].information.timestamp')),
          '%d/%m/%Y, %H.%i.%s'
        )) = CURDATE()`
      );

      // Get messages in specific ranges
      const messagesMorning = await DashboardController.getMessagesInRange(
        "00:00:00",
        "11:59:59"
      );
      const messagesAfternoon = await DashboardController.getMessagesInRange(
        "12:00:00",
        "15:59:59"
      );
      const messagesEvening = await DashboardController.getMessagesInRange(
        "16:00:00",
        "18:59:59"
      );

      const listMessagesMorning =
        DashboardController.formatMessages(messagesMorning);

      // format listMessagesMorning to no duplicate contact
      const lastMessagesMorning = listMessagesMorning.filter(
        (message, index, self) =>
          index ===
          self.findIndex(
            (t) =>
              t.contact.number === message.contact.number &&
              t.contact.name === message.contact.name
          )
      );

      const listMessagesAfternoon =
        DashboardController.formatMessages(messagesAfternoon);

      // format listMessagesAfternoon to no duplicate contact
      const lastMessagesAfternoon = listMessagesAfternoon.filter(
        (message, index, self) =>
          index ===
          self.findIndex(
            (t) =>
              t.contact.number === message.contact.number &&
              t.contact.name === message.contact.name
          )
      );

      const listMessagesEvening =
        DashboardController.formatMessages(messagesEvening);

      // format listMessagesEvening to no duplicate contact
      const lastMessagesEvening = listMessagesEvening.filter(
        (message, index, self) =>
          index ===
          self.findIndex(
            (t) =>
              t.contact.number === message.contact.number &&
              t.contact.name === message.contact.name
          )
      );

      // Fetch messages from the last 7 days
      const messages7DaysAgo = await db
        .select()
        .from(messages)
        .innerJoin(contacts, eq(phoneNumberQuery, contacts.number))
        .where(
          between(
            sql`DATE_FORMAT(
              STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(${messages.message}, '$[last].information.timestamp')),
              '%d/%m/%Y, %H.%i.%s'), '%Y-%m-%d')`,
            sevenDaysAgo,
            today
          )
        )
        .execute();

      const listMessages7DaysAgo =
        DashboardController.formatMessages(messages7DaysAgo);

      // format listMessages7DaysAgo to no duplicate contact
      const lastMessages7DaysAgo = listMessages7DaysAgo.filter(
        (message, index, self) =>
          index ===
          self.findIndex(
            (t) =>
              t.contact.number === message.contact.number &&
              t.contact.name === message.contact.name
          )
      );

      // Send the response
      return res.status(200).json({
        totalContact,
        totalMessage,
        totalLabel,
        totalGroup,
        totalAllMessageToday,
        totalNewMessageToday,
        totalMessageTodayFromMe,
        lastMessages7DaysAgo,
        lastMessagesMorning,
        lastMessagesAfternoon,
        lastMessagesEvening,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
}
