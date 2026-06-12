import useTradeStore from '../store/tradeStore';

const useTrade = () => {
  const { trades, isLoading, isPlacing, total, page, pages, fetchTrades, placeTrade } = useTradeStore();
  return { trades, isLoading, isPlacing, total, page, pages, fetchTrades, placeTrade };
};

export default useTrade;
