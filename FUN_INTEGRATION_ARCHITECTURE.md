# Fun.xyz Integration Architecture

## Overview

Enterprise payment infrastructure integration for PolyBet365, matching Polymarket's payment stack.

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Fun.xyz       │
│                 │    │                 │    │                 │
│ PaymentManager  │◄──►│ Payment Routes  │◄──►│ Enterprise API  │
│     ↓           │    │     ↓           │    │                 │
│ FunProvider     │    │ PaymentService  │    │  - Deposits     │
│ MoonPay Widget  │    │     ↓           │    │  - Withdrawals  │
│                 │    │ Webhook Handler│    │  - Orchestration│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Database      │
                    │                 │
                    │ Deposit Model   │
                    │ Withdrawal Model│
                    │ User Balance    │
                    └─────────────────┘
```

## Components

### Frontend Layer

#### 1. PaymentManager (`/frontend/src/lib/paymentProviders/PaymentManager.js`)
- **Purpose**: Orchestrates multiple payment providers
- **Features**:
  - Primary: Fun.xyz (enterprise)
  - Fallback: MoonPay (direct)
  - Automatic provider selection
  - Unified API for deposits/withdrawals

#### 2. FunProvider (`/frontend/src/lib/paymentProviders/FunProvider.js`)
- **Purpose**: Fun.xyz SDK wrapper
- **Features**:
  - Enterprise API integration
  - Session management
  - Payment method discovery
  - Webhook signature verification

#### 3. DepositWidget (`/frontend/src/components/deposit/DepositWidget.jsx`)
- **Purpose**: User-facing deposit interface
- **Features**:
  - Matches Polymarket UI/UX
  - Dynamic provider switching
  - Real-time status updates
  - Multi-method support

### Backend Layer

#### 1. Payment Routes (`/backend/src/routes/payments.js`)
- **Endpoints**:
  - `POST /api/payments/fun/webhook` - Fun.xyz webhook handler
  - `GET /api/payments/deposits/:sessionId` - Deposit status
  - `POST /api/payments/withdrawals` - Create withdrawal

#### 2. PaymentService (`/backend/src/services/paymentService.js`)
- **Purpose**: Business logic for payment operations
- **Features**:
  - Webhook event processing
  - Balance updates
  - Transaction tracking
  - Error handling

#### 3. Database Models
- **Deposit Model**: Tracks all deposit transactions
- **Withdrawal Model**: Tracks all withdrawal transactions
- **Indexes**: Optimized for user queries and status lookups

## Payment Flow

### Deposit Flow

1. **User Initiates Deposit**
   ```
   User clicks "Deposit" → DepositWidget opens
   ```

2. **Provider Selection**
   ```
   PaymentManager.getActiveProvider()
   ↓
   Returns 'fun' if configured, else 'moonpay'
   ```

3. **Session Creation**
   ```
   Fun: createDepositSession() → Fun API
   MoonPay: Return widget config
   ```

4. **Payment Processing**
   ```
   Fun: Redirect to Fun's hosted page
   MoonPay: Embedded widget flow
   ```

5. **Webhook Confirmation**
   ```
   Fun → Backend Webhook → Update Database → Credit Balance
   ```

### Withdrawal Flow

1. **User Requests Withdrawal**
   ```
   User enters amount/destination → Create withdrawal record
   ```

2. **Provider Processing**
   ```
   PaymentManager.createWithdrawal() → Fun API
   ```

3. **Blockchain Transaction**
   ```
   Fun orchestrates actual on-chain transfer
   ```

4. **Status Update**
   ```
   Webhook → Mark withdrawal complete
   ```

## Configuration

### Environment Variables

#### Frontend (`.env`)
```env
# Fun.xyz (Enterprise)
VITE_FUN_API_KEY=your_fun_api_key
VITE_FUN_ENV=sandbox
VITE_FUN_API_URL=https://api.fun.xyz/v1
VITE_FUN_WEBHOOK_SECRET=your_webhook_secret

# MoonPay (Fallback)
VITE_MOONPAY_API_KEY=your_moonpay_api_key
```

#### Backend (`.env`)
```env
# Fun.xyz (Enterprise)
FUN_API_KEY=your_fun_api_key
FUN_ENV=sandbox
FUN_API_URL=https://api.fun.xyz/v1
FUN_WEBHOOK_SECRET=your_webhook_secret
```

## Security Considerations

1. **Webhook Verification**
   - HMAC signature verification
   - Replay attack prevention
   - IP whitelisting (recommended)

2. **API Security**
   - Rate limiting on endpoints
   - JWT authentication for user actions
   - HTTPS enforcement

3. **Data Protection**
   - Sensitive data encryption
   - Audit logging
   - PCI compliance (via Fun.xyz)

## Monitoring & Analytics

### Key Metrics
- Deposit success rate
- Payment method distribution
- Average transaction time
- Failure reasons by provider

### Logging
- All webhook events
- Provider API calls
- Error conditions
- Performance metrics

## Deployment Notes

1. **Webhook Endpoint**
   - Must be publicly accessible
   - Configure in Fun.xyz dashboard
   - Test with sandbox environment first

2. **Database Migration**
   - Run migrations for Deposit/Withdrawal models
   - Create indexes for performance
   - Back up existing data

3. **Feature Flags**
   - Enable/disable providers dynamically
   - A/B test new providers
   - Gradual rollout strategy

## Next Steps

1. **Contact Fun.xyz Sales**
   - Enterprise partnership discussion
   - API documentation and SDK access
   - Test environment credentials

2. **Implementation**
   - Complete integration with actual Fun API
   - Test sandbox environment
   - Security audit

3. **Production Launch**
   - Gradual traffic migration
   - Monitor performance metrics
   - Customer support preparation

## Benefits

- **Enterprise Reliability**: 99.9%+ uptime SLA
- **Global Coverage**: 100+ countries, 50+ payment methods
- **Optimized Conversion**: Industry-leading deposit rates
- **Regulatory Compliance**: Built-in compliance infrastructure
- **Scalability**: Handles billions in transaction volume

This architecture ensures PolyBet365 matches Polymarket's enterprise-grade payment infrastructure while maintaining flexibility for future provider additions.
