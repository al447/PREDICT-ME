import Header from './Header';
import CategoryNav from './CategoryNav';
import Footer from './Footer';
import BottomNav from './BottomNav';

const Layout = ({ children, showCategoryNav = true, showFooter = true }) => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      {showCategoryNav && <CategoryNav />}
      <main className="flex-1 pb-16 md:pb-0">
        {children}
      </main>
      {showFooter && <Footer />}
      <BottomNav />
    </div>
  );
};

export default Layout;
