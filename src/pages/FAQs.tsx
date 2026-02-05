import BottomNav from "@/components/BottomNav";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { HelpCircle } from "lucide-react";

const FAQs = () => {
  const faqs = [
    {
      question: "What is Whale Trading?",
      answer: "Whale Trading is a whale-powered investment platform where you deposit real USDT (BEP20) and our advanced whale trading bot generates returns through automated cryptocurrency trading strategies. You earn 100% profit on your investment every 120 hours (5 days)."
    },
    {
      question: "How does the whale trading bot work?",
      answer: "Our proprietary whale trading bot uses advanced algorithms and machine learning to analyze crypto markets 24/7. It executes high-frequency trades across multiple exchanges, generating consistent returns. Your investments work continuously, and profits are automatically credited to your wallet after each 120-hour trading cycle."
    },
    {
      question: "What cryptocurrency do you support?",
      answer: "We exclusively use USDT (Tether) on the BEP20 network (Binance Smart Chain). All deposits, withdrawals, and returns are in USDT BEP20. Make sure you send and receive funds only on the BEP20 network to avoid loss of funds."
    },
    {
      question: "What are the minimum deposit and withdrawal amounts?",
      answer: "The minimum deposit is $10 USDT and the minimum withdrawal is also $10 USDT. There is no maximum limit - you can invest as much as you want and scale your earnings."
    },
    {
      question: "How does the 5-level referral system work?",
      answer: "When someone deposits using your referral code, you earn commissions: Level 1 (10%), Level 2 (4%), Level 3 (2%), Level 4 (1%), and Level 5 (1%). These commissions are paid instantly on every deposit and are added directly to your wallet balance. Build your network and earn passive income!"
    },
    {
      question: "How long does it take to see returns?",
      answer: "Each whale trading cycle runs for exactly 120 hours (5 days). At the end of each cycle, you receive 100% profit on your investment. For example, if you invest $100, you'll have $200 in your wallet after 120 hours. Your original investment plus profits are automatically credited and available for withdrawal or reinvestment."
    },
    {
      question: "How do I deposit USDT?",
      answer: "Go to the Wallet page, select the Deposit tab, and you'll see the admin BEP20 wallet address with a QR code. Send your USDT (BEP20 network only) to that address, then enter the exact amount in the deposit form and submit. Your deposit will be approved within 24 hours, and your investment will start automatically."
    },
    {
      question: "How long do withdrawals take?",
      answer: "Withdrawal requests are processed within 2-3 hours during business hours. Once approved, USDT is sent directly to your BEP20 wallet address. Make sure to double-check your wallet address before submitting a withdrawal request."
    },
    {
      question: "How do I invite friends and earn referral commissions?",
      answer: "Go to the Team or Invite section to get your unique referral code and shareable link. Share it via Telegram, WhatsApp, social media, or any platform. When someone signs up with your code and makes a deposit, you automatically earn commission at all 5 levels of your referral network."
    },
    {
      question: "Is my investment safe?",
      answer: "We take security seriously. All funds are managed through secure blockchain transactions, and our whale trading operates with risk management protocols. However, like all crypto investments, there are inherent market risks. Only invest what you can afford, and always withdraw your profits regularly."
    },
    {
      question: "Can I reinvest my profits?",
      answer: "Absolutely! After each 120-hour cycle completes, your profits are added to your wallet balance. You can immediately withdraw or make a new deposit to reinvest and compound your earnings. Many successful users reinvest to maximize their returns."
    },
    {
      question: "What if I have issues with my deposit or withdrawal?",
      answer: "Contact our support team immediately through Telegram. Provide your transaction hash, wallet address, and details of the issue. Our team responds within 24 hours and will resolve any problems quickly."
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <HelpCircle className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Help & FAQs</h1>
        </div>
        <p className="text-sm opacity-90">Everything you need to know about Whale Trading</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card className="p-6">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10">
          <h3 className="font-semibold text-foreground mb-2">Need More Help?</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Can't find what you're looking for? Contact our support team on Telegram for immediate assistance with deposits, withdrawals, or any questions.
          </p>
          <a 
            href="mailto:zoho.bot.llc@gmail.com" 
            className="text-primary font-medium text-sm hover:underline block mb-2"
          >
            📧 Email: zoho.bot.llc@gmail.com
          </a>
          <a 
            href="https://t.me/whaletrading_support" 
            className="text-primary font-medium text-sm hover:underline block"
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 Telegram Support →
          </a>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default FAQs;
