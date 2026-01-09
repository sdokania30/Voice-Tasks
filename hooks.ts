
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent, RecurringPayment, EmailLog } from './types';
import { sendPaymentReminderEmail, initEmailService } from './services/emailService';

// Initialize SpeechRecognition once
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const useSpeechRecognition = (
    onTranscriptChange: (update: (prev: string) => string) => void,
    durationLimit: number = 30
) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [error, setError] = useState('');
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const recordingIntervalRef = useRef<number | null>(null);

    useEffect(() => {
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            
            recognition.onresult = (event: SpeechRecognitionEvent) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) {
                     onTranscriptChange(prev => prev ? `${prev.trim()} ${finalTranscript.trim()}`: finalTranscript.trim());
                }
            };
    
            recognition.onerror = (event: SpeechRecognitionErrorEvent) => setError(`Speech recognition error: ${event.error}`);
            
            recognition.onend = () => {
                setIsRecording(false);
                if(recordingIntervalRef.current) {
                    clearInterval(recordingIntervalRef.current);
                    recordingIntervalRef.current = null;
                }
            };
            
            recognitionRef.current = recognition;
        } else {
            setError('Speech recognition is not supported in this browser.');
        }
    }, [onTranscriptChange]);

    const toggleRecording = useCallback(() => {
        const recognition = recognitionRef.current;
        if (!recognition) return;
        
        if (isRecording) {
            recognition.stop();
        } else {
            // REMOVED: onTranscriptChange(() => ''); // Do not clear transcript automatically
            recognition.start();
            setIsRecording(true);
            setRecordingTime(0);
            recordingIntervalRef.current = window.setInterval(() => {
                setRecordingTime(prevTime => prevTime + 1);
            }, 1000);
        }
    }, [isRecording, onTranscriptChange]);

    useEffect(() => {
        const recognition = recognitionRef.current;
        if (isRecording && recognition && recordingTime >= durationLimit) {
            recognition.stop();
        }
    }, [isRecording, recordingTime, durationLimit]);

    return { 
        isRecording, 
        recordingTime, 
        toggleRecording, 
        error, 
        isSupported: !!SpeechRecognition 
    };
};

export const useResizablePanel = (initialWidth = 60) => {
    const [panelWidth, setPanelWidth] = useState(initialWidth);
    const isResizing = useRef(false);

    const handleMouseDown = useCallback(() => {
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const handleMouseUp = useCallback(() => {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = (e.clientX / window.innerWidth) * 100;
        if (newWidth > 30 && newWidth < 80) { // Constraints for resizing
            setPanelWidth(newWidth);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return { panelWidth, handleMouseDown };
};

export const usePayments = () => {
    const [payments, setPayments] = useState<RecurringPayment[]>(() => {
        try { return JSON.parse(localStorage.getItem('voice-to-payments') || '[]'); } catch { return []; }
    });
    
    const [emailLogs, setEmailLogs] = useState<EmailLog[]>(() => {
        try { return JSON.parse(localStorage.getItem('email-logs') || '[]'); } catch { return []; }
    });

    // Default to doks23@gmail.com if not present in local storage
    const [recipientEmail, setRecipientEmail] = useState<string>(() => {
        return localStorage.getItem('recipient-email') || 'doks23@gmail.com';
    });
    
    // Tracks where the last successful email was actually sent
    const [lastSentTo, setLastSentTo] = useState<string>(() => {
        return localStorage.getItem('lastEmailSentTo') || '';
    });
    
    // 'idle' | 'sending' | 'sent' | 'error' | 'already_sent' | 'missing_config'
    const [emailStatus, setEmailStatus] = useState<string>('idle');
    const isSendingRef = useRef(false); 

    useEffect(() => {
        localStorage.setItem('voice-to-payments', JSON.stringify(payments));
    }, [payments]);

    useEffect(() => {
        localStorage.setItem('email-logs', JSON.stringify(emailLogs));
    }, [emailLogs]);

    useEffect(() => {
        localStorage.setItem('recipient-email', recipientEmail);
    }, [recipientEmail]);

    const addPayment = (payment: RecurringPayment) => setPayments(prev => [...prev, payment]);
    const deletePayment = (id: string) => setPayments(prev => prev.filter(p => p.id !== id));
    
    const editPayment = (id: string, updatedPayment: Partial<RecurringPayment>) => {
        setPayments(prev => prev.map(p => p.id === id ? { ...p, ...updatedPayment } as RecurringPayment : p));
    };

    const togglePaymentStatus = (id: string) => {
        setPayments(prev => prev.map(p => {
            if (p.id !== id) return p;
            
            const now = new Date();
            // Check if already paid this month
            const isPaidThisMonth = p.lastPaidDate && 
                                    new Date(p.lastPaidDate).getMonth() === now.getMonth() && 
                                    new Date(p.lastPaidDate).getFullYear() === now.getFullYear();

            if (isPaidThisMonth) {
                // Mark as Pending (remove date)
                return { ...p, lastPaidDate: undefined };
            } else {
                // Mark as Done (set to now)
                return { ...p, lastPaidDate: new Date().toISOString() };
            }
        }));
    };

    // Calculate Actionable Payments (Due Today, Tomorrow OR Overdue) for UI Display
    const duePayments = useMemo(() => {
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        const tomorrowDay = tomorrow.getDate();
        const tomorrowMonth = tomorrow.getMonth();
        const tomorrowYear = tomorrow.getFullYear();
        const daysInTomorrowMonth = new Date(tomorrowYear, tomorrowMonth + 1, 0).getDate();

        return payments.filter(p => {
            // 1. Check if paid this month
            const isPaidThisMonth = p.lastPaidDate && 
                                    new Date(p.lastPaidDate).getMonth() === currentMonth && 
                                    new Date(p.lastPaidDate).getFullYear() === currentYear;
            
            if (isPaidThisMonth) return false;

            // 2. Check Today
            const isToday = p.dueDay === currentDay;

            // 3. Check Tomorrow
            let isTomorrow = false;
            if (p.dueDay === tomorrowDay) isTomorrow = true;
            // Handle end of month edge case
            if (tomorrowDay === daysInTomorrowMonth && p.dueDay > daysInTomorrowMonth) isTomorrow = true;

            // 4. Check Overdue (Past date in current month, and not paid)
            const isOverdue = p.dueDay < currentDay;

            return isToday || isTomorrow || isOverdue;
        });
    }, [payments]);

    // Automatic Email Sending Logic
    // Designed to send at 6:00 AM, OR immediately on load if the 6:00 AM slot was missed (Catch-up).
    useEffect(() => {
        const checkAndSendEmails = async () => {
            if (isSendingRef.current) return;

            // Recalculate actionable payments fresh to avoid stale closures if app is open for 24h+
            const now = new Date();
            const currentDay = now.getDate();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const tomorrow = new Date(now);
            tomorrow.setDate(currentDay + 1);
            const tomorrowDay = tomorrow.getDate();
            const tomorrowMonth = tomorrow.getMonth();
            const tomorrowYear = tomorrow.getFullYear();
            const daysInTomorrowMonth = new Date(tomorrowYear, tomorrowMonth + 1, 0).getDate();

            const actionablePayments = payments.filter(p => {
                const isPaidThisMonth = p.lastPaidDate && 
                                        new Date(p.lastPaidDate).getMonth() === currentMonth && 
                                        new Date(p.lastPaidDate).getFullYear() === currentYear;
                if (isPaidThisMonth) return false;
                const isToday = p.dueDay === currentDay;
                let isTomorrow = false;
                if (p.dueDay === tomorrowDay) isTomorrow = true;
                if (tomorrowDay === daysInTomorrowMonth && p.dueDay > daysInTomorrowMonth) isTomorrow = true;
                const isOverdue = p.dueDay < currentDay;
                return isToday || isTomorrow || isOverdue;
            });

            if (actionablePayments.length === 0) {
                 if (emailStatus === 'error' || emailStatus === 'missing_config') setEmailStatus('idle');
                 return;
            }

            const todayStr = now.toDateString();
            const lastSentToStored = localStorage.getItem('lastEmailSentTo');
            const emailChanged = lastSentToStored !== recipientEmail;

            const sentPaymentIds = new Set<string>();
            if (!emailChanged) {
                emailLogs.forEach(log => {
                    const logDate = new Date(log.sentAt).toDateString();
                    if (logDate === todayStr && log.status === 'success' && log.paymentId) {
                        sentPaymentIds.add(log.paymentId);
                    }
                });
            }

            const paymentsToSend = actionablePayments.filter(p => !sentPaymentIds.has(p.id));

            if (paymentsToSend.length === 0) {
                 if (emailStatus !== 'sent' && emailStatus !== 'already_sent') {
                      setEmailStatus('already_sent');
                 }
                 return;
            }

            isSendingRef.current = true;
            setEmailStatus('sending');
            initEmailService();

            let hasErrors = false;
            let missingConfig = false;
            let sentCount = 0;

            for (const payment of paymentsToSend) {
                 const result = await sendPaymentReminderEmail(payment, recipientEmail);
                 if (result === 'missing_config') {
                    missingConfig = true;
                    break;
                 }
                 const log: EmailLog = {
                     id: Math.random().toString(36).substr(2, 9),
                     paymentId: payment.id,
                     serviceName: payment.serviceName,
                     amount: payment.amount,
                     sentAt: new Date().toISOString(),
                     status: result === 'success' ? 'success' : 'failed'
                 };
                 setEmailLogs(prev => [log, ...prev]);
                 if (result === 'success') sentCount++;
                 if (result === 'error') hasErrors = true;
                 if (paymentsToSend.length > 1) await new Promise(resolve => setTimeout(resolve, 2500));
            }

            isSendingRef.current = false;

            if (missingConfig) {
                setEmailStatus('missing_config');
            } else if (sentCount > 0 && !hasErrors) {
                localStorage.setItem('lastEmailSentDate', todayStr);
                localStorage.setItem('lastEmailSentTo', recipientEmail);
                setLastSentTo(recipientEmail);
                setEmailStatus('sent');
            } else if (hasErrors) {
                setEmailStatus('error');
            }
        };

        const now = new Date();
        const lastSentDate = localStorage.getItem('lastEmailSentDate');
        const todayStr = now.toDateString();

        // Target: Today 6:00 AM
        const targetTime = new Date(now);
        targetTime.setHours(6, 0, 0, 0);

        let timerId: ReturnType<typeof setTimeout>;

        if (lastSentDate === todayStr) {
            // Already sent today. Sleep until tomorrow 6 AM.
            const tomorrowSixAm = new Date(targetTime);
            tomorrowSixAm.setDate(tomorrowSixAm.getDate() + 1);
            const msUntilTomorrow = tomorrowSixAm.getTime() - now.getTime();
            
            console.log(`Emails already sent today. Next check in ${(msUntilTomorrow/3600000).toFixed(1)} hours.`);
            timerId = setTimeout(() => {
                // Just trigger the check function to handle the new day
                checkAndSendEmails();
            }, msUntilTomorrow);

        } else {
            // Not sent today yet
            if (now >= targetTime) {
                // It is past 6 AM (e.g., 8 AM or app was closed at 6). 
                // CATCH-UP LOGIC: Send immediately.
                console.log("Scheduled time (6:00 AM) passed. Sending emails now.");
                checkAndSendEmails();
            } else {
                // It is before 6 AM (e.g., 2 AM). Wait.
                const msUntilSix = targetTime.getTime() - now.getTime();
                console.log(`Waiting ${(msUntilSix/60000).toFixed(1)} mins until 6:00 AM dispatch.`);
                timerId = setTimeout(checkAndSendEmails, msUntilSix);
            }
        }

        return () => {
            if (timerId) clearTimeout(timerId);
        };

    }, [payments, recipientEmail, emailLogs, emailStatus]); // Depend on 'payments' to handle additions/removals correctly

    return { 
        payments, 
        addPayment, 
        deletePayment, 
        editPayment,
        togglePaymentStatus,
        duePayments, 
        emailStatus, 
        emailLogs, 
        recipientEmail, 
        setRecipientEmail,
        lastSentTo
    };
};
