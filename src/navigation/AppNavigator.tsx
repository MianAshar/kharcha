import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { COLORS } from '../constants/colors';
import { CATEGORY_MAP } from '../constants/categories';
import { RootStackParamList, MainTabParamList } from '../types';

import SplashScreen from '../screens/SplashScreen';
import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import ScanReceiptScreen from '../screens/ScanReceiptScreen';
import ReviewExpenseScreen from '../screens/ReviewExpenseScreen';
import MonthlyTransactionsScreen from '../screens/MonthlyTransactionsScreen';
import TransactionsFeedScreen from '../screens/TransactionsFeedScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import ExpenseDetailScreen from '../screens/ExpenseDetailScreen';
import ExpensesListScreen from '../screens/ExpensesListScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.outlineVariant,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ScanReceipt"
        component={ScanReceiptScreen}
        options={{
          tabBarLabel: 'Scan',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📷" focused={focused} />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={MonthlyTransactionsScreen}
        options={{
          tabBarLabel: 'Transactions',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💳" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          headerBackTitle: '',
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="ReviewExpense"
          component={ReviewExpenseScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ExpenseDetail"
          component={ExpenseDetailScreen}
          options={{
            headerShown: true,
            title: 'Expense Detail',
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.secondary,
            headerTitleStyle: { fontWeight: '700' },
          }}
        />
        <Stack.Screen
          name="ExpensesList"
          component={ExpensesListScreen}
          options={{
            headerShown: true,
            title: 'All Expenses',
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.secondary,
            headerTitleStyle: { fontWeight: '700' },
          }}
        />
        <Stack.Screen
          name="TransactionDetail"
          component={TransactionDetailScreen}
          options={{
            headerShown: true,
            title: 'Transaction Detail',
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.secondary,
            headerTitleStyle: { fontWeight: '700' },
          }}
        />
        <Stack.Screen
          name="TransactionsFeed"
          component={TransactionsFeedScreen}
          options={({ route }) => ({
            headerShown: true,
            title: route.params.bank
            ?? (route.params.category
              ? (CATEGORY_MAP[route.params.category]?.name ?? route.params.category)
              : 'All Transactions'),
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.secondary,
            headerTitleStyle: { fontWeight: '700' },
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
