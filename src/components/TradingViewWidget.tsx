import { useEffect, useRef, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface TradingViewWidgetProps {
  symbol?: string;
  height?: number;
}

const TradingViewWidget = memo(({ symbol = "BINANCE:BTCUSDT", height = 400 }: TradingViewWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget using safe DOM APIs (prevents XSS)
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    widgetContainer.style.height = `${height}px`;
    widgetContainer.style.width = '100%';
    containerRef.current.appendChild(widgetContainer);

    // Create and load script
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    
    // Use textContent instead of innerHTML for script content (XSS safe)
    script.textContent = JSON.stringify({
      autosize: false,
      width: "100%",
      height: height,
      symbol: symbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      support_host: "https://www.tradingview.com"
    });

    scriptRef.current = script;
    containerRef.current.appendChild(script);

    return () => {
      // Safe cleanup using DOM APIs
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, [symbol, height]);

  return (
    <Card className="overflow-hidden border-primary/20 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="w-5 h-5 text-primary animate-pulse" />
          Live Market Chart
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div 
          ref={containerRef} 
          className="tradingview-widget-container"
          style={{ height: `${height}px`, width: '100%' }}
        />
      </CardContent>
    </Card>
  );
});

TradingViewWidget.displayName = 'TradingViewWidget';

export default TradingViewWidget;
