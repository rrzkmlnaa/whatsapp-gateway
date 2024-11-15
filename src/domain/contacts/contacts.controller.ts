import { Request, Response } from "express";
import { client } from "../../wa";
import { db } from "../../config/database/database";
import { contacts } from "./contacts.schema";
import { eq } from "drizzle-orm";

export class ContactsController {
  static async getContacts(_req: Request, res: Response) {
    const { phoneNumber } = _req.query;

    const phoneNumberString =
      typeof phoneNumber === "string" ? phoneNumber : "";

    try {
      let contactData;

      if (phoneNumberString) {
        // Fetch labels that match the given phoneNumberString
        contactData = await db.query.contacts.findMany({
          where: eq(contacts.number, phoneNumberString),
        });
      } else {
        // Fetch all labels if labelId is not provided
        contactData = await db.query.contacts.findMany();
      }

      if (contactData.length === 0) {
        return res.status(404).json({ message: "No Labels found" });
      }

      return res.status(200).json(contactData);
    } catch (error) {
      console.error("Error fetching Labels:", error);
      return res.status(500).send("Failed to fetch Labels");
    }
  }

  static async initContacts(_req: Request, res: Response) {
    try {
      let contactData = await client.getContacts();

      if (contactData.length === 0) {
        return res.status(404).json({ message: "No contacts found" });
      }

      // only contacts type not group
      contactData = contactData.filter(
        (contact) => contact.id._serialized.split("@")[1] === "c.us"
      );

      // remove duplicate contacts
      contactData = contactData.filter(
        (contact, index, self) =>
          index ===
          self.findIndex(
            (t) =>
              t.id._serialized === contact.id._serialized &&
              t.name === contact.name
          )
      );

      // remove duplicate contacts by number
      contactData = contactData.filter(
        (contact, index, self) =>
          index ===
          self.findIndex(
            (t) => t.number === contact.number && t.name === contact.name
          )
      );

      // auto add name if not available
      contactData = contactData.map((contact) => {
        if (!contact.name) {
          contact.name = "Unknown";
        }
        return contact;
      });

      // format contacts only with name and number
      const formattedContacts = contactData.map((contact) => ({
        name: contact.name,
        number: contact.number,
      }));

      // insert contacts to database
      await db.insert(contacts).values(formattedContacts);

      return res.status(200).json({ message: "Contacts initialized" });
    } catch (error) {
      console.error("Error fetching contacts:", error);
      return res.status(500).send("Failed to fetch contacts");
    }
  }
}
