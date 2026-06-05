import useFavoritesStore from '../store/favoritesStore';

const useFavorites = () => {
  const { toggleFavorite, isFavorited, favorites, fetchFavorites, isLoading } = useFavoritesStore();
  return { toggleFavorite, isFavorited, favorites, fetchFavorites, isLoading };
};

export default useFavorites;
