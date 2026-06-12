@echo off
echo === Removing Escrow/Contract Dead Code ===
echo.

REM Backend services
del "backend\src\services\escrowService.js" 2>nul
del "backend\src\services\contractService.js" 2>nul

REM Backend routes
del "backend\src\routes\contract.js" 2>nul
del "backend\src\routes\settlement.js" 2>nul

REM Backend controllers
del "backend\src\controllers\settlementController.js" 2>nul

REM Backend contract ABIs
del "backend\src\contracts\PolyBet365Escrow.json" 2>nul
del "backend\src\contracts\MockUSDT.json" 2>nul

REM Remove empty contracts directory in backend
rmdir "backend\src\contracts" 2>nul

echo.
echo === Removing Hardhat Contracts Folder ===
echo.

REM Entire contracts folder (Hardhat project)
rmdir /s /q "contracts" 2>nul

echo.
echo === Cleanup Complete ===
echo Removed all escrow/contract related dead code.
echo.
echo To verify: restart backend with 'npm run dev'
pause
