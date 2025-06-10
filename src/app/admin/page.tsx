'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { products } from '@/lib/products';

// Define interfaces for the data we expect
interface PurchaseEvent {
  id: number;
  timestamp: string;
  email: string;
  product_id?: string;
  stripe_session_id?: string;
  status: string;
  seller_id?: number;
  points_awarded?: number;
  details?: any;
}

interface UserPoints {
  email: string;
  total_points: number;
  message?: string; // For 'user not found' cases
}

const ADMIN_API_SECRET = process.env.NEXT_PUBLIC_ADMIN_API_SECRET || 'your-admin-api-secret-key';

const IS_ADMIN_AUTH_ENABLED = process.env.NEXT_PUBLIC_ADMIN_AUTH_ENABLED === 'true';
// IMPORTANT: For IS_ADMIN_AUTH_ENABLED to work correctly, you must set
// NEXT_PUBLIC_ADMIN_AUTH_ENABLED in your .env.local file (e.g., NEXT_PUBLIC_ADMIN_AUTH_ENABLED=true)
// and ensure your Next.js build process includes it. If ADMIN_AUTH_ENABLED is true
// but not exposed as NEXT_PUBLIC_ADMIN_AUTH_ENABLED, this button will not appear.

export default function AdminPage() {
  const [purchaseEmail, setPurchaseEmail] = useState('');
  const [sellerId, setSellerId] = useState('');
  const router = useRouter();

  const [allEvents, setAllEvents] = useState<PurchaseEvent[]>([]);
  const [searchedUserEmail, setSearchedUserEmail] = useState('');
  const [userPoints, setUserPoints] = useState<UserPoints | null>(null);
  const [userEvents, setUserEvents] = useState<PurchaseEvent[]>([]);
  
  const [sellerLookupId, setSellerLookupId] = useState('');
  const [sellerLookupMonthYear, setSellerLookupMonthYear] = useState('');
  const [sellerEvents, setSellerEvents] = useState<PurchaseEvent[]>([]);
  const [sellerTotalVolume, setSellerTotalVolume] = useState<number>(0);
  
  const [loading, setLoading] = useState<Record<string, boolean>>({}); // e.g. { initDb: true, allEvents: false }
  const [messages, setMessages] = useState<Record<string, string | null>>({}); // For success/error messages
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  const handleLogout = async () => {
    setIsLogoutLoading(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        router.push('/login'); // Redirect to login page after successful logout
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Logout failed. Please try again.' }));
        alert(errorData.message || 'Logout failed. Please try again.'); // Simple error display
        console.error('Logout failed:', errorData);
      }
    } catch (error) {
      console.error('Logout request error:', error);
      alert('An error occurred during logout. Please try again.');
    } finally {
      setIsLogoutLoading(false);
    }
  };

  const makeAdminApiRequest = async (endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
    setLoading(prev => ({ ...prev, [endpoint]: true }));
    setMessages(prev => ({ ...prev, [endpoint]: null }));
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'X-Admin-Secret': ADMIN_API_SECRET, // Send secret in header
      };
      const response = await fetch(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Request failed with status: ' + response.status }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      console.error(`Error calling ${endpoint}:`, error);
      setMessages(prev => ({ ...prev, [endpoint]: error.message || 'An unexpected error occurred.' }));
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [endpoint]: false }));
    }
  };

  const handleInitializeDb = async () => {
    const data = await makeAdminApiRequest('/api/admin/init-db', 'POST');
    if (data) {
      setMessages(prev => ({ ...prev, initDb: data.message || 'DB Initialization request sent.' }));
    }
  };

  const fetchAllEvents = async () => {
    const data = await makeAdminApiRequest('/api/admin/events/all');
    if (data) {
      setAllEvents(data as PurchaseEvent[]);
      setMessages(prev => ({ ...prev, allEvents: 'Fetched all events.' }));
    }
  };

  const handleSellerSearch = async () => {
    if (!sellerLookupId.trim()) {
      setMessages(prev => ({ ...prev, sellerSearch: 'Please enter a Seller ID to search.' }));
      return;
    }
    setSellerEvents([]);
    setSellerTotalVolume(0);

    let endpoint = `/api/admin/events/seller?sellerId=${encodeURIComponent(sellerLookupId)}`;
    if (sellerLookupMonthYear.trim()) {
      // Basic validation for YYYY-MM format
      if (!/^\d{4}-\d{2}$/.test(sellerLookupMonthYear.trim())) {
        setMessages(prev => ({ ...prev, sellerSearch: 'Invalid date format. Please use YYYY-MM.' }));
        return;
      }
      endpoint += `&monthYear=${encodeURIComponent(sellerLookupMonthYear.trim())}`;
    }

    const data = await makeAdminApiRequest(endpoint);
    if (data) {
      setSellerEvents(data.events as PurchaseEvent[]);
      setSellerTotalVolume(data.totalVolume || 0);
      setMessages(prev => ({ ...prev, sellerSearch: `Search complete for Seller ID: ${sellerLookupId}.` }));
    }
  };

  const handleSearchUser = async () => {
    if (!searchedUserEmail.trim()) {
      setMessages(prev => ({ ...prev, userSearch: 'Please enter an email to search.' }));
      return;
    }
    setUserPoints(null);
    setUserEvents([]);

    const pointsData = await makeAdminApiRequest(`/api/admin/user/points?email=${encodeURIComponent(searchedUserEmail)}`);
    if (pointsData) setUserPoints(pointsData as UserPoints);

    const eventsData = await makeAdminApiRequest(`/api/admin/user/events?email=${encodeURIComponent(searchedUserEmail)}`);
    if (eventsData) setUserEvents(eventsData as PurchaseEvent[]);
    
    setMessages(prev => ({ ...prev, userSearch: `Searched for ${searchedUserEmail}.` }));
  };
  
  // Fetch all events on initial load
  useEffect(() => {
    fetchAllEvents();
  }, []);

  const handlePurchaseRequest = (productId: string) => {
    const sellerIdNumber = parseInt(sellerId, 10);
    if (sellerId.trim() !== '' && (isNaN(sellerIdNumber) || sellerIdNumber < 0)) {
        alert('Please enter a valid, non-negative integer for the Seller ID.');
        return;
    }
    if (!purchaseEmail.trim()) {
      alert('Please enter a user email for the purchase.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(purchaseEmail)) {
      alert('Please enter a valid email address.');
      return;
    }
    router.push(`/checkout?email=${encodeURIComponent(purchaseEmail)}&productId=${productId}&sellerId=${sellerId.trim()}`);
  };

  const renderTable = (data: PurchaseEvent[]) => {
    if (!data || data.length === 0) return <p>No events to display.</p>;
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
        <thead>
          <tr>
            {['ID', 'Timestamp', 'Email', 'Product ID', 'Seller ID', 'Stripe ID', 'Status', 'Points', 'Details'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map(event => (
            <tr key={event.id}>
              <td style={tableCellStyle}>{event.id}</td>
              <td style={tableCellStyle}>{new Date(event.timestamp).toLocaleString()}</td>
              <td style={tableCellStyle}>{event.email}</td>
              <td style={tableCellStyle}>{event.product_id || 'N/A'}</td>
              <td style={tableCellStyle}>{event.seller_id !== null ? event.seller_id : 'N/A'}</td>
              <td style={tableCellStyle}>{event.stripe_session_id || 'N/A'}</td>
              <td style={tableCellStyle}>{event.status}</td>
              <td style={tableCellStyle}>{event.points_awarded !== null ? event.points_awarded : 'N/A'}</td>
              <td style={tableCellStyle}>{event.details ? JSON.stringify(event.details) : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const sectionStyle: React.CSSProperties = { marginTop: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '5px', backgroundColor: '#f9f9f9', overflowX: 'auto' };
  const inputStyle: React.CSSProperties = { padding: '10px', marginRight: '10px', borderRadius: '4px', border: '1px solid #ccc',color: '#333' };
  const buttonStyle: React.CSSProperties = { padding: '10px 15px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px' };
  const tableHeaderStyle: React.CSSProperties = { border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f0f0f0', color: '#333' };
  const tableCellStyle: React.CSSProperties = { border: '1px solid #ddd', padding: '8px', textAlign: 'left', color: '#333' };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Admin Dashboard</h1>
        {IS_ADMIN_AUTH_ENABLED && (
          <button
            onClick={handleLogout}
            disabled={isLogoutLoading}
            style={{...buttonStyle, backgroundColor: '#dc3545', padding: '10px 20px'}}
          >
            {isLogoutLoading ? 'Logging out...' : 'Logout'}
          </button>
        )}
      </div>

      {/* Purchase Request Section */}
      <div style={sectionStyle}>
        <h2 style={{ color: '#333' }}>Create Purchase Request</h2>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="purchaseEmail" style={{ display: 'block', marginBottom: '5px', color: '#333' }}>User Email for Purchase:</label>
          <input
            type="email"
            id="purchaseEmail"
            value={purchaseEmail}
            onChange={(e) => setPurchaseEmail(e.target.value)}
            placeholder="user@example.com"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="sellerId" style={{ display: 'block', marginBottom: '5px', color: '#333' }}>Seller ID (Optional):</label>
          <input
            type="number"
            id="sellerId"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            placeholder="e.g., 12345"
            style={inputStyle}
          />
        </div>
        <div>
          <h3 style={{ color: '#333' }}>Select Product:</h3>
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => handlePurchaseRequest(product.id)}
              style={{...buttonStyle, marginRight: '10px', marginBottom: '10px'}}
            >
              {product.name} (€{product.price.toFixed(2)}) - {product.points} Points
            </button>
          ))}
        </div>
      </div>

      {/* Database Initialization Section */}
      <div style={sectionStyle}>
        <h2 style={{ color: '#333' }}>Database Management</h2>
        <button onClick={handleInitializeDb} disabled={loading['/api/admin/init-db']} style={buttonStyle}>
          {loading['/api/admin/init-db'] ? 'Initializing...' : 'Initialize/Verify DB Schema'}
        </button>
        {messages['/api/admin/init-db'] && <p style={{color: messages['/api/admin/init-db']?.includes('Failed') ? 'red' : 'green'}}>{messages['/api/admin/init-db']}</p>}
      </div>

      {/* Seller Data Lookup Section */}
      <div style={sectionStyle}>
        <h2 style={{ color: '#333' }}>Seller Data Lookup</h2>
        <p style={{ color: '#666', fontSize: '0.9em', marginTop: '-10px', marginBottom: '15px' }}>
          Filter successful payment events by Seller ID and optionally by month.
        </p>
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <input
            type="number"
            value={sellerLookupId}
            onChange={(e) => setSellerLookupId(e.target.value)}
            placeholder="Enter Seller ID"
            style={{...inputStyle, flexGrow: 1}}
          />
          <input
            type="text"
            value={sellerLookupMonthYear}
            onChange={(e) => setSellerLookupMonthYear(e.target.value)}
            placeholder="YYYY-MM (Optional)"
            style={{...inputStyle, flexGrow: 1}}
          />
          <button onClick={handleSellerSearch} disabled={loading['/api/admin/events/seller']} style={buttonStyle}>
            {loading['/api/admin/events/seller'] ? 'Searching...' : 'Search Seller'}
          </button>
        </div>
        {messages.sellerSearch && <p style={{ color: messages.sellerSearch.startsWith('Invalid') ? 'red' : '#666', fontStyle: 'italic' }}>{messages.sellerSearch}</p>}
        
        {sellerEvents.length > 0 && (
          <div>
            <h3 style={{ color: '#333' }}>Total Volume for this period: €{Number(sellerTotalVolume).toFixed(2)}</h3>
            {renderTable(sellerEvents)}
          </div>
        )}
      </div>

      {/* User Data Lookup Section */}
      <div style={sectionStyle}>
        <h2 style={{ color: '#333' }}>User Data Lookup</h2>
        <p style={{ color: '#666', fontSize: '0.9em', marginTop: '-10px', marginBottom: '15px' }}>
          Filter User activities by user email.
        </p>
        <input 
          type="email" 
          value={searchedUserEmail} 
          onChange={(e) => setSearchedUserEmail(e.target.value)} 
          placeholder="Enter user email to search"
          style={inputStyle}
        />
        <button onClick={handleSearchUser} disabled={loading[`/api/admin/user/points?email=${searchedUserEmail}`] || loading[`/api/admin/user/events?email=${searchedUserEmail}`]} style={buttonStyle}>
          {loading[`/api/admin/user/points?email=${searchedUserEmail}`] || loading[`/api/admin/user/events?email=${searchedUserEmail}`] ? 'Searching...' : 'Search User Data'}
        </button>
        {messages.userSearch && <p>{messages.userSearch}</p>}
        {userPoints && (
          <div style={{marginTop: '15px'}}>
            <h3 style={{ color: '#333' }}>User Points: {userPoints.email}</h3>
            {userPoints.message ? <p style={{ color: 'red' }}>{userPoints.message}</p> : <p style={{ color: '#333' }}>Total Points: <strong>{userPoints.total_points}</strong></p>}
          </div>
        )}
        {userEvents.length > 0 && (
          <div style={{marginTop: '15px'}}>
            <h3 style={{ color: '#333' }}>User Purchase History: {searchedUserEmail}</h3>
            {renderTable(userEvents)}
          </div>
        )}
        {messages[`/api/admin/user/points?email=${searchedUserEmail}`] && <p style={{color: 'red'}}>{messages[`/api/admin/user/points?email=${searchedUserEmail}`]}</p>}
        {messages[`/api/admin/user/events?email=${searchedUserEmail}`] && <p style={{color: 'red'}}>{messages[`/api/admin/user/events?email=${searchedUserEmail}`]}</p>}
      </div>

      {/* All Purchase Events Section */}
      <div style={sectionStyle}>
        <h2 style={{ color: '#333' }}>All Purchase Events</h2>
        <button onClick={fetchAllEvents} disabled={loading['/api/admin/events/all']} style={{...buttonStyle, marginBottom: '15px'}}>
          {loading['/api/admin/events/all'] ? 'Refreshing...' : 'Refresh All Events'}
        </button>
        {messages['/api/admin/events/all'] && <p>{messages['/api/admin/events/all']}</p>}
        {renderTable(allEvents)}
      </div>

    </div>
  );
}
