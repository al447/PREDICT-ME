import useAuthStore from '../store/authStore';

const useAuth = () => {
  const { user, token, isAuthModalOpen, isLoading, setAuth, logout, openAuthModal, closeAuthModal, fetchMe } = useAuthStore();
  return { user, token, isAuthModalOpen, isLoading, setAuth, logout, openAuthModal, closeAuthModal, fetchMe, isAuthenticated: !!user };
};

export default useAuth;
