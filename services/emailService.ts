import emailjs from '@emailjs/browser';
import { RecurringPayment } from '../types';

// -----------------------------------------------------------------------------
// CONFIGURATION REQUIRED
// You must replace these placeholders with your actual EmailJS credentials.
// Get them at https://dashboard.emailjs.com/
// -----------------------------------------------------------------------------
const SERVICE_ID = 'service_65pdxnc'; 
const TEMPLATE_ID = 'template_1pkh8w9';
const PUBLIC_KEY = 'y1rvuqyUX9gDDhjH7'; 

export const initEmailService = () => {
  if (PUBLIC_KEY && !PUBLIC_KEY.startsWith('YOUR_')) {
    emailjs.init(PUBLIC_KEY);
  }
};

export const sendPaymentReminderEmail = async (payment: RecurringPayment, recipientEmail: string): Promise<'success' | 'error' | 'missing_config'> => {
  // Check if credentials are generic placeholders or empty
  if (
    !SERVICE_ID || SERVICE_ID.startsWith('YOUR_') ||
    !TEMPLATE_ID || TEMPLATE_ID.startsWith('YOUR_') ||
    !PUBLIC_KEY || PUBLIC_KEY.startsWith('YOUR_')
  ) {
    console.warn('EmailJS credentials are missing. Please configure services/emailService.ts');
    return 'missing_config';
  }

  const today = new Date();
  const currentDay = today.getDate();
  const isOverdue = payment.dueDay < currentDay;

  // Calculate Due Date String
  let dateStr = "";
  if (isOverdue) {
    // If overdue, it was due on the payment.dueDay of THIS month
    const dueDate = new Date();
    dueDate.setDate(payment.dueDay);
    dateStr = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } else {
    // Assume tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateStr = tomorrow.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // SUGGESTED EMAILJS TEMPLATE CONFIGURATION:
  // Subject Field: {{subject}}
  // Body Field:    {{message}}
  
  // Determine Subject and Message
  const subject = isOverdue 
    ? `URGENT: Overdue Payment Alert - ${payment.serviceName}`
    : `Reminder: Upcoming Payment - ${payment.serviceName}`;

  const message = isOverdue
    ? `Attention Required: Your payment for ${payment.serviceName} of ₹${payment.amount} was due on ${dateStr}. Please clear this dues immediately.`
    : `Friendly Reminder: Your payment for ${payment.serviceName} of ₹${payment.amount} is due tomorrow, ${dateStr}.`;

  try {
    const templateParams = {
      // Pass the email in multiple common variable names to maximize compatibility with the user's template
      to_email: recipientEmail,
      to_name: recipientEmail, 
      recipient: recipientEmail,
      email: recipientEmail,
      
      subject: subject,
      service_name: payment.serviceName,
      amount: `₹${payment.amount}`, // Add Rupee symbol explicitly here
      due_date: dateStr,
      message: message,
      content: message // Alias for compatibility
    };

    // Explicitly pass PUBLIC_KEY as the 4th argument to ensure auth works for every request
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
    console.log(`Email sent for ${payment.serviceName} to ${recipientEmail}`);
    return 'success';
  } catch (error) {
    console.error('Failed to send email:', error);
    return 'error';
  }
};