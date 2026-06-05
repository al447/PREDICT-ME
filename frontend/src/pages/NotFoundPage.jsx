import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';

const NotFoundPage = () => (
  <Layout showFooter={false}>
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-8xl mb-6">📊</div>
      <h1 className="text-4xl font-bold text-[var(--color-text)] mb-2">404</h1>
      <p className="text-xl text-[var(--color-text-muted)] mb-6">This market doesn't exist</p>
      <Link to="/">
        <Button variant="primary" size="lg">Back to Home</Button>
      </Link>
    </div>
  </Layout>
);

export default NotFoundPage;
